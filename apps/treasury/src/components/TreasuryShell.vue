<template>
  <main class="min-h-screen bg-[#f3f4ee] text-ink">
    <section class="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
      <header class="flex flex-col gap-4 border-b border-black/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex min-w-0 items-center gap-3">
          <div class="grid size-11 shrink-0 place-items-center rounded-lg bg-ink text-white shadow-sm">
            <Landmark class="size-5" aria-hidden="true" />
          </div>
          <div class="min-w-0">
            <h1 class="truncate text-2xl font-black tracking-normal sm:text-3xl">
              Mana Treasury
            </h1>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-black/60">
              <span class="rounded-md bg-white px-2 py-1 font-semibold text-black/70 ring-1 ring-black/10">
                {{ reserveSymbol }} backed
              </span>
              <span
                class="rounded-md px-2 py-1 font-semibold ring-1"
                :class="config.deployed ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200'"
              >
                {{ config.deployed ? "Deployed" : "Undeployed" }}
              </span>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            data-testid="about-button"
            class="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-black/10 bg-white px-4 text-sm font-black text-black/70 shadow-sm transition hover:bg-black/5"
            @click="aboutOpen = true"
          >
            <Info class="size-4" aria-hidden="true" />
            About
          </button>
          <div class="grid grid-cols-2 rounded-lg border border-black/10 bg-white p-1 shadow-sm">
            <button
              v-for="option in clusterOptions"
              :key="option"
              type="button"
              class="rounded-md px-4 py-2 text-sm font-bold transition"
              :class="cluster === option ? 'bg-ink text-white shadow-sm' : 'text-black/60 hover:bg-black/5'"
              @click="selectCluster(option)"
            >
              {{ getClusterConfig(option).label }}
            </button>
          </div>
          <WalletMultiButton />
        </div>
      </header>

      <section
        v-if="loadError"
        class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
      >
        {{ loadError }}
      </section>

      <section
        v-if="props.walletErrorMessage"
        class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
      >
        {{ props.walletErrorMessage }}
      </section>

      <section
        v-if="!config.deployed"
        class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
      >
        Mainnet config is present with the production MIM mint. Treasury actions are disabled until the mainnet treasury is deployed.
      </section>

      <section
        v-if="validationErrors.length"
        class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
      >
        <div class="mb-1 flex items-center gap-2 font-black">
          <AlertTriangle class="size-4" aria-hidden="true" />
          Config mismatch
        </div>
        <p v-for="error in validationErrors" :key="error" class="break-words">
          {{ error }}
        </p>
      </section>

      <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Active reserve"
          :value="metricReserve"
          :sub-value="activeReserveAddress"
          tone="reserve"
          :loading="loading"
        />
        <MetricTile
          label="Active MANA supply"
          :value="metricManaSupply"
          :sub-value="manaMintAddress"
          tone="mana"
          :loading="loading"
        />
        <MetricTile
          label="NAV"
          :value="metricNav"
          :sub-value="`${reserveSymbol} per MANA`"
          tone="neutral"
          :loading="loading"
        />
        <MetricTile
          label="Cooldown"
          :value="metricCooldown"
          :sub-value="cooldownSubValue"
          tone="neutral"
          :loading="loading"
        />
      </section>

      <section class="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div class="grid gap-4">
          <section class="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
            <div class="mb-4 flex items-center justify-between gap-3">
              <h2 class="text-lg font-black">Vaults</h2>
              <button
                type="button"
                class="grid size-9 place-items-center rounded-md border border-black/10 text-black/60 transition hover:bg-black/5"
                title="Refresh treasury state"
                :disabled="loading"
                @click="refresh"
              >
                <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" aria-hidden="true" />
              </button>
            </div>
            <div class="grid gap-3 md:grid-cols-3">
              <VaultTile
                label="Active reserve"
                :amount="formatReserve(snapshot?.activeReserveVault.amount)"
                :address="snapshot?.activeReserveVault.address"
                :config="config"
              />
              <VaultTile
                label="Pending reserve"
                :amount="formatReserve(snapshot?.pendingReserveVault.amount)"
                :address="snapshot?.pendingReserveVault.address"
                :config="config"
              />
              <VaultTile
                label="Pending MANA"
                :amount="formatMana(snapshot?.pendingManaVault.amount)"
                :address="snapshot?.pendingManaVault.address"
                :config="config"
              />
            </div>
          </section>

          <section class="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
            <div class="mb-4 flex items-center justify-between gap-3">
              <h2 class="text-lg font-black">User balances</h2>
              <span class="text-xs font-bold uppercase tracking-normal text-black/45">
                {{ walletStatus }}
              </span>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <BalanceTile
                :symbol="reserveSymbol"
                :amount="formatReserve(snapshot?.user?.reserveBalance)"
                :address="snapshot?.user?.reserveAta"
                :exists="snapshot?.user?.reserveAtaExists"
                :connected="walletConnected"
                :loading="loading"
                :config="config"
                tone="reserve"
              />
              <BalanceTile
                symbol="MANA"
                :amount="formatMana(snapshot?.user?.manaBalance)"
                :address="snapshot?.user?.manaAta"
                :exists="snapshot?.user?.manaAtaExists"
                :connected="walletConnected"
                :loading="loading"
                :config="config"
                tone="mana"
              />
            </div>
          </section>

          <section
            class="rounded-lg border border-black/10 bg-white p-4 shadow-sm"
            data-testid="recent-transactions-panel"
          >
            <div class="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 class="text-lg font-black">Recent transactions</h2>
                <p class="mt-1 text-xs font-semibold text-black/45">
                  {{ transactionFeedAddressText }}
                </p>
              </div>
              <button
                type="button"
                class="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 text-black/60 transition hover:bg-black/5"
                title="Refresh transactions"
                :disabled="transactionsLoading"
                @click="refreshTransactions"
              >
                <RefreshCw class="size-4" :class="{ 'animate-spin': transactionsLoading }" aria-hidden="true" />
              </button>
            </div>

            <div class="mb-4 grid grid-cols-3 rounded-lg border border-black/10 bg-field p-1">
              <button
                v-for="option in transactionScopeOptions"
                :key="option.value"
                type="button"
                :data-testid="`transaction-tab-${option.value}`"
                class="rounded-md px-2 py-2 text-sm font-black transition"
                :class="transactionScope === option.value ? 'bg-ink text-white shadow-sm' : 'text-black/55 hover:bg-white'"
                @click="transactionScope = option.value"
              >
                {{ option.label }}
              </button>
            </div>

            <div v-if="transactionError" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
              {{ transactionError }}
            </div>
            <div v-else-if="transactionFeedUnavailable" class="rounded-lg bg-field px-3 py-6 text-center text-sm font-semibold text-black/50">
              {{ transactionFeedUnavailable }}
            </div>
            <div v-else-if="transactionsLoading" class="rounded-lg bg-field px-3 py-6 text-center text-sm font-semibold text-black/50">
              Loading transactions
            </div>
            <div v-else-if="recentTransactions.length === 0" class="rounded-lg bg-field px-3 py-6 text-center text-sm font-semibold text-black/50">
              No recent transactions found
            </div>
            <div v-else class="grid gap-2">
              <article
                v-for="transaction in recentTransactions"
                :key="transaction.signature"
                class="grid gap-2 rounded-lg bg-field px-3 py-2 sm:grid-cols-[minmax(0,1fr)_92px_88px_auto] sm:items-center"
              >
                <div class="min-w-0">
                  <a
                    class="inline-flex max-w-full items-center gap-1 text-sm font-black text-black/75 underline"
                    :href="explorerUrl(config, transaction.signature, 'tx')"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span class="truncate">{{ shortAddress(transaction.signature) }}</span>
                    <ExternalLink class="size-3.5 shrink-0" aria-hidden="true" />
                  </a>
                  <p class="mt-1 text-xs font-semibold text-black/45">
                    {{ formatTransactionTime(transaction.blockTime) }}
                  </p>
                </div>
                <span
                  class="w-fit rounded-md px-2 py-1 text-xs font-black"
                  :class="transaction.err ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'"
                >
                  {{ transaction.err ? "Failed" : transaction.confirmationStatus ?? "Confirmed" }}
                </span>
                <span class="text-xs font-bold text-black/45">Slot {{ transaction.slot }}</span>
                <span v-if="transaction.memo" class="truncate text-xs font-semibold text-black/45">
                  {{ transaction.memo }}
                </span>
              </article>
            </div>
          </section>
        </div>

        <aside class="grid content-start gap-4">
          <ActionPanel
            title="Deposit"
            :icon="ArrowDownToLine"
            :disabled="depositActionDisabled"
            :busy="busyAction === 'deposit'"
            :input-value="forms.deposit"
            :input-label="reserveSymbol"
            button-label="Deposit"
            :message="depositActionMessage"
            :preview="depositPreviewText"
            @update:input-value="forms.deposit = $event"
            @submit="prepareAction('deposit')"
          />
          <ActionPanel
            title="Donate"
            :icon="Gift"
            :disabled="donateActionDisabled"
            :busy="busyAction === 'donate'"
            :input-value="forms.donate"
            :input-label="reserveSymbol"
            button-label="Donate"
            :message="donateActionMessage"
            :preview="donatePreviewText"
            @update:input-value="forms.donate = $event"
            @submit="prepareAction('donate')"
          />
          <ActionPanel
            title="Start destake"
            :icon="ArrowUpFromLine"
            :disabled="destakeActionDisabled"
            :busy="busyAction === 'destake'"
            :input-value="forms.destake"
            input-label="MANA"
            button-label="Start destake"
            :message="destakeActionMessage"
            :preview="destakePreviewText"
            @update:input-value="forms.destake = $event"
            @submit="prepareAction('destake')"
          />

          <section class="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <Clock3 class="size-5 text-ink" aria-hidden="true" />
                <h2 class="text-lg font-black">Finalize</h2>
              </div>
              <span
                class="rounded-md px-2 py-1 text-xs font-black"
                :class="canFinalize ? 'bg-emerald-50 text-emerald-700' : 'bg-black/5 text-black/55'"
              >
                {{ finalizeStatus }}
              </span>
            </div>
            <div v-if="redemption" class="space-y-2 text-sm">
              <div class="flex justify-between gap-3">
                <span class="text-black/55">Reserved</span>
                <span class="font-black">{{ formatReserve(redemption.reservedReserveAmount) }}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span class="text-black/55">MANA</span>
                <span class="font-black">{{ formatMana(redemption.manaAmount) }}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span class="text-black/55">Unlock</span>
                <span class="font-black">{{ unlockText }}</span>
              </div>
            </div>
            <div v-else class="text-sm font-semibold text-black/45">
              No open redemption
            </div>
            <button
              type="button"
              class="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-black text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-black/20"
              :disabled="finalizeActionDisabled || busyAction === 'finalize'"
              @click="prepareAction('finalize')"
            >
              <Loader2 v-if="busyAction === 'finalize'" class="size-4 animate-spin" aria-hidden="true" />
              <CheckCircle2 v-else class="size-4" aria-hidden="true" />
              Finalize destake
            </button>
            <p v-if="finalizeActionMessage" class="mt-3 text-sm font-semibold text-black/55">
              {{ finalizeActionMessage }}
            </p>
          </section>
        </aside>
      </section>

      <section
        v-if="aboutOpen"
        class="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4 py-6 backdrop-blur-sm"
        data-testid="about-modal"
      >
        <div class="max-h-[calc(100vh-3rem)] w-full max-w-3xl overflow-auto rounded-lg border border-black/10 bg-white p-5 shadow-2xl">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-xl font-black">About Mana Treasury</h2>
              <p class="mt-1 text-sm font-semibold text-black/55">
                {{ config.label }} configuration addresses
              </p>
            </div>
            <button
              type="button"
              class="grid size-9 place-items-center rounded-md border border-black/10 text-black/60 hover:bg-black/5"
              title="Close"
              @click="aboutOpen = false"
            >
              <X class="size-4" aria-hidden="true" />
            </button>
          </div>

          <div v-if="addressRows.length" class="mt-5 grid gap-2">
            <div
              v-for="row in addressRows"
              :key="row.label"
              class="grid gap-2 rounded-lg bg-field px-3 py-2 sm:grid-cols-[150px_minmax(0,1fr)_auto_auto] sm:items-center"
            >
              <span class="text-sm font-black text-black/55">{{ row.label }}</span>
              <div class="min-w-0">
                <p class="text-sm font-black text-black/75">{{ shortAddress(row.address) }}</p>
                <code class="mt-1 block min-w-0 break-all text-xs font-bold text-black/55">{{ row.address }}</code>
              </div>
              <button
                type="button"
                class="inline-flex size-8 items-center justify-center rounded-md border border-black/10 text-black/55 hover:bg-white"
                :title="`Copy ${row.label}`"
                @click="copyAddress(row)"
              >
                <Check v-if="copiedAddressLabel === row.label" class="size-4 text-emerald-700" aria-hidden="true" />
                <Copy v-else class="size-4" aria-hidden="true" />
              </button>
              <a
                class="inline-flex size-8 items-center justify-center rounded-md border border-black/10 text-black/55 hover:bg-white"
                :href="explorerUrl(config, row.address)"
                target="_blank"
                rel="noreferrer"
                :title="`Open ${row.label} in explorer`"
              >
                <ExternalLink class="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>
          <div v-else class="mt-5 rounded-lg bg-field px-3 py-6 text-center text-sm font-semibold text-black/50">
            Treasury is not deployed on this cluster.
          </div>
        </div>
      </section>

      <section
        v-if="confirmation"
        class="fixed inset-0 z-40 grid place-items-center bg-black/30 px-4 py-6 backdrop-blur-sm"
      >
        <div class="w-full max-w-xl rounded-lg border border-black/10 bg-white p-5 shadow-2xl">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-xl font-black">{{ confirmation.title }}</h2>
              <p class="mt-1 text-sm font-semibold text-black/55">
                {{ confirmation.clusterLabel }}
              </p>
            </div>
            <button
              type="button"
              class="grid size-9 place-items-center rounded-md border border-black/10 text-black/60 hover:bg-black/5"
              title="Close"
              @click="confirmation = null"
            >
              <X class="size-4" aria-hidden="true" />
            </button>
          </div>

          <div class="mt-4 grid gap-2 text-sm">
            <div
              v-for="row in confirmation.rows"
              :key="row.label"
              class="flex justify-between gap-3 rounded-md bg-field px-3 py-2"
            >
              <span class="text-black/55">{{ row.label }}</span>
              <span class="break-all text-right font-black">{{ row.value }}</span>
            </div>
          </div>

          <div
            class="mt-4 rounded-lg border px-3 py-2 text-sm"
            :class="confirmation.simulation.err ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'"
          >
            <div class="flex items-center gap-2 font-black">
              <XCircle v-if="confirmation.simulation.err" class="size-4" aria-hidden="true" />
              <CheckCircle2 v-else class="size-4" aria-hidden="true" />
              {{ confirmation.simulation.err ? "Transaction check failed" : "Ready to send" }}
            </div>
            <p v-if="confirmation.simulation.err" class="mt-1 break-words">
              {{ transactionCheckMessage(confirmation) }}
            </p>
            <p v-else class="mt-1">
              Estimated compute: {{ confirmation.simulation.unitsConsumed ?? "unknown" }} units
            </p>
          </div>

          <details
            v-if="confirmation.simulation.logs?.length"
            class="mt-4 rounded-lg bg-ink p-3 text-xs text-white/80"
          >
            <summary class="cursor-pointer font-black text-white">Program details</summary>
            <div class="mt-2 max-h-36 overflow-auto">
              <p v-for="log in confirmation.simulation.logs.slice(-8)" :key="log" class="break-words">
                {{ log }}
              </p>
            </div>
          </details>

          <div class="mt-5 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              class="h-11 rounded-lg border border-black/10 px-4 text-sm font-black text-black/70 hover:bg-black/5"
              @click="confirmation = null"
            >
              Cancel
            </button>
            <button
              type="button"
              class="flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-black text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-black/20"
              :disabled="sending || Boolean(confirmation.simulation.err)"
              @click="sendConfirmed"
            >
              <Loader2 v-if="sending" class="size-4 animate-spin" aria-hidden="true" />
              <Send v-else class="size-4" aria-hidden="true" />
              Sign and send
            </button>
          </div>
        </div>
      </section>

      <section
        v-if="lastSignature"
        class="fixed bottom-4 left-1/2 z-30 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-xl"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="font-black">Transaction confirmed</span>
          <a
            class="inline-flex items-center gap-1 font-black underline"
            :href="explorerUrl(config, lastSignature, 'tx')"
            target="_blank"
            rel="noreferrer"
          >
            Explorer
            <ExternalLink class="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { WalletMultiButton } from "@solana/wallet-adapter-vue-ui";
import { useWallet } from "@solana/wallet-adapter-vue";
import type { Transaction } from "@solana/web3.js";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Gift,
  Info,
  Landmark,
  Loader2,
  RefreshCw,
  Send,
  X,
  XCircle,
} from "lucide-vue-next";
import {
  computed,
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
  type Component,
  type PropType,
} from "vue";
import {
  formatRatio,
  formatTokenAmount,
  parseUiAmount,
} from "../lib/amounts";
import {
  CLUSTERS,
  explorerUrl,
  getClusterConfig,
  isDeployedConfig,
  parseClusterParam,
  type ClusterConfig,
  type ClusterName,
} from "../lib/solana.config";
import {
  buildDepositTransaction,
  buildDonateReserveTransaction,
  buildFinalizeDestakeTransaction,
  buildStartDestakeTransaction,
  createConnection,
  createDepositPreview,
  createDestakePreview,
  loadRecentTransactions,
  loadTreasurySnapshot,
  resolveTransactionFeedTarget,
  simulateTreasuryTransaction,
  type PreparedSimulation,
  type RecentTransaction,
  type RedemptionSnapshot,
  type TreasurySnapshot,
  type TransactionFeedScope,
} from "../lib/treasury-client";

type ActionKind = "deposit" | "donate" | "destake" | "finalize";
type Confirmation = {
  kind: ActionKind;
  title: string;
  clusterLabel: string;
  rows: Array<{ label: string; value: string }>;
  transaction: Transaction;
  simulation: PreparedSimulation["result"];
};

const props = withDefaults(
  defineProps<{
    walletErrorMessage?: string;
  }>(),
  {
    walletErrorMessage: "",
  }
);
const wallet = useWallet();
const clusterOptions = CLUSTERS;
const cluster = ref<ClusterName>(initialCluster());
const snapshot = ref<TreasurySnapshot | null>(null);
const loading = ref(false);
const loadError = ref("");
const busyAction = ref<ActionKind | null>(null);
const sending = ref(false);
const confirmation = ref<Confirmation | null>(null);
const lastSignature = ref("");
const aboutOpen = ref(false);
const copiedAddressLabel = ref("");
const transactionScope = ref<TransactionFeedScope>("treasury");
const recentTransactions = ref<RecentTransaction[]>([]);
const transactionsLoading = ref(false);
const transactionError = ref("");
const now = ref(Math.floor(Date.now() / 1000));
const forms = reactive({
  deposit: "",
  donate: "",
  destake: "",
});

let timer: ReturnType<typeof setInterval> | undefined;
let copyTimer: ReturnType<typeof setTimeout> | undefined;
let transactionRequestId = 0;

const config = computed(() => getClusterConfig(cluster.value));
const connection = computed(() => createConnection(config.value));
const reserveSymbol = computed(() =>
  cluster.value === "devnet" ? "DMIM" : "MIM"
);
const walletConnected = computed(
  () => wallet.connected.value && Boolean(wallet.publicKey.value)
);
const validationErrors = computed(() => snapshot.value?.validationErrors ?? []);
const hasValidationErrors = computed(() => validationErrors.value.length > 0);
const actionsDisabled = computed(
  () =>
    !isDeployedConfig(config.value) ||
    !walletConnected.value ||
    loading.value ||
    hasValidationErrors.value
);
const redemption = computed<RedemptionSnapshot | null>(
  () => snapshot.value?.user?.redemptionRequest ?? null
);
const hasOpenRedemption = computed(
  () => Boolean(redemption.value && !redemption.value.finalized)
);
const canFinalize = computed(
  () =>
    Boolean(redemption.value) &&
    !redemption.value?.finalized &&
    now.value >= (redemption.value?.unlockTimestamp ?? Number.POSITIVE_INFINITY)
);
const finalizeStatus = computed(() => {
  if (!redemption.value) return "Idle";
  if (redemption.value.finalized) return "Done";
  return canFinalize.value ? "Ready" : "Cooling";
});
const unlockText = computed(() => {
  if (!redemption.value) return "";
  const remaining = redemption.value.unlockTimestamp - now.value;
  if (remaining <= 0) return "Ready";
  return `${remaining}s`;
});
const walletStatus = computed(() =>
  wallet.publicKey.value ? shortAddress(wallet.publicKey.value.toString()) : "Disconnected"
);
const metricReserve = computed(() =>
  formatReserve(snapshot.value?.activeReserveVault.amount)
);
const metricManaSupply = computed(() =>
  formatMana(snapshot.value?.activeManaSupply)
);
const metricNav = computed(() => {
  if (!snapshot.value) return "0.0000";
  return formatRatio(
    snapshot.value.activeReserveVault.amount,
    snapshot.value.activeManaSupply
  );
});
const metricCooldown = computed(() =>
  snapshot.value
    ? `${snapshot.value.treasuryState.cooldownSeconds}s`
    : config.value.treasury?.cooldownSeconds
      ? `${config.value.treasury.cooldownSeconds}s`
      : "n/a"
);
const cooldownSubValue = computed(() =>
  redemption.value ? finalizeStatus.value : "No request"
);
const activeReserveAddress = computed(
  () => snapshot.value?.activeReserveVault.address ?? config.value.treasury?.activeReserveVault ?? ""
);
const manaMintAddress = computed(
  () => snapshot.value?.manaMint.address ?? config.value.treasury?.manaMint ?? ""
);
const depositPreviewText = computed(() => previewText("deposit", forms.deposit));
const donatePreviewText = computed(() => {
  try {
    const amount = parseUiAmount(forms.donate || "0", reserveDecimals.value);
    return amount > 0n ? `${formatReserve(amount)} donation` : "";
  } catch {
    return "";
  }
});
const destakePreviewText = computed(() => previewText("destake", forms.destake));
const reserveDecimals = computed(() => snapshot.value?.reserveMint.decimals ?? 6);
const manaDecimals = computed(() => snapshot.value?.manaMint.decimals ?? 6);
const depositActionMessage = computed(() =>
  reserveSourceIssue(parsedActionAmount(forms.deposit, reserveDecimals.value))
);
const donateActionMessage = computed(() =>
  reserveSourceIssue(parsedActionAmount(forms.donate, reserveDecimals.value))
);
const destakeActionMessage = computed(() => {
  if (hasOpenRedemption.value) {
    return "Finalize the current destake before starting another one.";
  }
  return manaSourceIssue(parsedActionAmount(forms.destake, manaDecimals.value));
});
const finalizeActionMessage = computed(() => {
  if (actionsDisabled.value) return baseActionIssue();
  if (!redemption.value) return "No open redemption request.";
  if (!canFinalize.value) return "Cooldown is still active.";
  return "";
});
const depositActionDisabled = computed(
  () => actionsDisabled.value || Boolean(depositActionMessage.value)
);
const donateActionDisabled = computed(
  () => actionsDisabled.value || Boolean(donateActionMessage.value)
);
const destakeActionDisabled = computed(
  () => actionsDisabled.value || Boolean(destakeActionMessage.value)
);
const finalizeActionDisabled = computed(
  () => actionsDisabled.value || Boolean(finalizeActionMessage.value)
);
const transactionScopeOptions: Array<{
  value: TransactionFeedScope;
  label: string;
}> = [
  { value: "treasury", label: "Treasury" },
  { value: "program", label: "Program" },
  { value: "wallet", label: "Wallet" },
];
const transactionFeedTarget = computed(() =>
  resolveTransactionFeedTarget(
    config.value,
    transactionScope.value,
    wallet.publicKey.value
  )
);
const transactionFeedUnavailable = computed(
  () => transactionFeedTarget.value.unavailableReason
);
const transactionFeedAddressText = computed(() =>
  transactionFeedTarget.value.address
    ? shortAddress(transactionFeedTarget.value.address)
    : transactionFeedUnavailable.value || "No feed"
);
const addressRows = computed(() => {
  const treasury = config.value.treasury;
  if (!treasury) return [];
  return [
    ["Program", treasury.manaTreasuryProgram],
    ["Treasury state", treasury.treasuryState],
    ["Authority PDA", treasury.treasuryAuthority],
    [`${reserveSymbol.value} mint`, treasury.reserveMint],
    ["MANA mint", treasury.manaMint],
    ["Active vault", treasury.activeReserveVault],
    ["Pending reserve", treasury.pendingReserveVault],
    ["Pending MANA", treasury.pendingManaVault],
  ].map(([label, address]) => ({ label, address }));
});

watch(
  [cluster, wallet.publicKey],
  () => {
    void refresh();
  },
  { immediate: true }
);

watch(
  [cluster, wallet.publicKey, transactionScope],
  () => {
    void refreshTransactions();
  },
  { immediate: true }
);

onMounted(() => {
  syncUrlCluster(cluster.value);
  timer = setInterval(() => {
    now.value = Math.floor(Date.now() / 1000);
  }, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  if (copyTimer) clearTimeout(copyTimer);
});

async function refresh() {
  loadError.value = "";
  snapshot.value = null;
  if (!config.value.deployed) return;

  loading.value = true;
  try {
    snapshot.value = await loadTreasurySnapshot(
      connection.value,
      config.value,
      wallet.publicKey.value
    );
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    loading.value = false;
  }
}

function selectCluster(next: ClusterName) {
  cluster.value = next;
  confirmation.value = null;
  lastSignature.value = "";
  syncUrlCluster(next);
}

async function refreshTransactions() {
  transactionError.value = "";
  recentTransactions.value = [];
  const requestId = ++transactionRequestId;
  const target = transactionFeedTarget.value;

  if (!target.address) {
    return;
  }

  transactionsLoading.value = true;
  try {
    const feed = await loadRecentTransactions(
      connection.value,
      config.value,
      transactionScope.value,
      wallet.publicKey.value
    );
    if (requestId !== transactionRequestId) return;
    recentTransactions.value = feed.transactions;
  } catch (error) {
    if (requestId !== transactionRequestId) return;
    transactionError.value = errorMessage(error);
  } finally {
    if (requestId === transactionRequestId) {
      transactionsLoading.value = false;
    }
  }
}

async function prepareAction(kind: ActionKind) {
  if (!isDeployedConfig(config.value) || !wallet.publicKey.value || !snapshot.value) {
    return;
  }

  busyAction.value = kind;
  loadError.value = "";
  confirmation.value = null;
  try {
    let transaction: Transaction;
    let rows: Confirmation["rows"];
    const owner = wallet.publicKey.value;

    if (kind === "deposit") {
      const amount = parseUiAmount(forms.deposit, reserveDecimals.value);
      assertReserveSourceReady(amount);
      const preview = createDepositPreview(
        amount,
        snapshot.value,
        config.value.defaultSlippageBps
      );
      transaction = await buildDepositTransaction(
        connection.value,
        config.value,
        owner,
        amount,
        preview.minOut
      );
      rows = [
        { label: "Deposit", value: formatReserve(amount) },
        { label: "Expected", value: formatMana(preview.estimatedOut) },
        { label: "Minimum", value: formatMana(preview.minOut) },
      ];
    } else if (kind === "donate") {
      const amount = parseUiAmount(forms.donate, reserveDecimals.value);
      assertReserveSourceReady(amount);
      transaction = await buildDonateReserveTransaction(
        connection.value,
        config.value,
        owner,
        amount
      );
      rows = [{ label: "Donation", value: formatReserve(amount) }];
    } else if (kind === "destake") {
      const amount = parseUiAmount(forms.destake, manaDecimals.value);
      assertManaSourceReady(amount);
      if (hasOpenRedemption.value) {
        throw new Error("Finalize the current destake before starting another one.");
      }
      const preview = createDestakePreview(
        amount,
        snapshot.value,
        config.value.defaultSlippageBps
      );
      transaction = await buildStartDestakeTransaction(
        connection.value,
        config.value,
        owner,
        amount,
        preview.minOut
      );
      rows = [
        { label: "Destake", value: formatMana(amount) },
        { label: "Expected", value: formatReserve(preview.estimatedOut) },
        { label: "Minimum", value: formatReserve(preview.minOut) },
      ];
    } else {
      if (finalizeActionMessage.value) {
        throw new Error(finalizeActionMessage.value);
      }
      transaction = await buildFinalizeDestakeTransaction(
        connection.value,
        config.value,
        owner
      );
      rows = redemption.value
        ? [
            { label: "Receive", value: formatReserve(redemption.value.reservedReserveAmount) },
            { label: "Burn", value: formatMana(redemption.value.manaAmount) },
          ]
        : [];
    }

    const prepared = await simulateTreasuryTransaction(
      connection.value,
      transaction,
      owner
    );
    confirmation.value = {
      kind,
      title: actionTitle(kind),
      clusterLabel: config.value.label,
      rows: [
        { label: "Cluster", value: config.value.label },
        { label: "Wallet", value: owner.toString() },
        ...rows,
      ],
      transaction: prepared.transaction,
      simulation: prepared.result,
    };
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    busyAction.value = null;
  }
}

async function sendConfirmed() {
  if (!confirmation.value || !wallet.publicKey.value) return;

  sending.value = true;
  loadError.value = "";
  try {
    const signature = await wallet.sendTransaction(
      confirmation.value.transaction,
      connection.value,
      {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      }
    );
    await connection.value.confirmTransaction(signature, "confirmed");
    lastSignature.value = signature;
    confirmation.value = null;
    forms.deposit = "";
    forms.donate = "";
    forms.destake = "";
    await refresh();
    await refreshTransactions();
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    sending.value = false;
  }
}

function baseActionIssue() {
  if (!isDeployedConfig(config.value)) {
    return "Treasury is not deployed on this cluster.";
  }
  if (!walletConnected.value) {
    return "Connect a wallet to continue.";
  }
  if (loading.value) {
    return "Refreshing treasury state.";
  }
  if (hasValidationErrors.value) {
    return "Resolve the config mismatch before sending transactions.";
  }
  if (!snapshot.value?.user) {
    return "Loading wallet balances.";
  }
  return "";
}

function parsedActionAmount(input: string, decimals: number) {
  if (!input.trim()) return null;
  try {
    const amount = parseUiAmount(input, decimals);
    return amount > 0n ? amount : null;
  } catch {
    return null;
  }
}

function reserveSourceIssue(amount: bigint | null) {
  const baseIssue = baseActionIssue();
  if (baseIssue) return baseIssue;

  const user = snapshot.value?.user;
  if (!user) return "Loading wallet balances.";
  if (!user.reserveAtaExists) {
    return `Your wallet does not have a ${reserveSymbol.value} token account yet. Receive ${reserveSymbol.value}, then refresh.`;
  }
  if (user.reserveBalance <= 0n) {
    return `No ${reserveSymbol.value} balance available.`;
  }
  if (amount && amount > user.reserveBalance) {
    return `Balance is ${formatReserve(user.reserveBalance)}.`;
  }
  return "";
}

function manaSourceIssue(amount: bigint | null) {
  const baseIssue = baseActionIssue();
  if (baseIssue) return baseIssue;

  const user = snapshot.value?.user;
  if (!user) return "Loading wallet balances.";
  if (!user.manaAtaExists) {
    return `Your wallet does not have a MANA token account yet. Deposit ${reserveSymbol.value} first.`;
  }
  if (user.manaBalance <= 0n) {
    return "No MANA balance available.";
  }
  if (amount && amount > user.manaBalance) {
    return `Balance is ${formatMana(user.manaBalance)}.`;
  }
  return "";
}

function assertReserveSourceReady(amount: bigint) {
  const issue = reserveSourceIssue(amount);
  if (issue) throw new Error(issue);
}

function assertManaSourceReady(amount: bigint) {
  const issue = manaSourceIssue(amount);
  if (issue) throw new Error(issue);
}

function previewText(kind: "deposit" | "destake", input: string) {
  if (!snapshot.value || !input.trim()) return "";
  try {
    const amount = parseUiAmount(
      input,
      kind === "deposit" ? reserveDecimals.value : manaDecimals.value
    );
    if (amount <= 0n) return "";
    const preview =
      kind === "deposit"
        ? createDepositPreview(amount, snapshot.value, config.value.defaultSlippageBps)
        : createDestakePreview(amount, snapshot.value, config.value.defaultSlippageBps);
    return `Est. ${
      kind === "deposit"
        ? formatMana(preview.estimatedOut)
        : formatReserve(preview.estimatedOut)
    }`;
  } catch {
    return "";
  }
}

function formatReserve(amount: bigint | undefined | null) {
  return `${formatTokenAmount(amount ?? 0n, reserveDecimals.value)} ${reserveSymbol.value}`;
}

function formatMana(amount: bigint | undefined | null) {
  return `${formatTokenAmount(amount ?? 0n, manaDecimals.value)} MANA`;
}

function initialCluster(): ClusterName {
  if (typeof window === "undefined") return "devnet";
  return parseClusterParam(new URLSearchParams(window.location.search).get("cluster"));
}

function syncUrlCluster(next: ClusterName) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("cluster", next);
  window.history.replaceState(null, "", url);
}

async function copyAddress(row: { label: string; address: string }) {
  await navigator.clipboard?.writeText(row.address);
  copiedAddressLabel.value = row.label;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copiedAddressLabel.value = "";
  }, 1200);
}

function shortAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatTransactionTime(blockTime: number | null) {
  if (!blockTime) return "Unknown time";
  return new Date(blockTime * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function actionTitle(kind: ActionKind) {
  if (kind === "deposit") return "Deposit";
  if (kind === "donate") return "Donate";
  if (kind === "destake") return "Start destake";
  return "Finalize destake";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function transactionCheckMessage(confirmation: Confirmation) {
  const logs = confirmation.simulation.logs?.join("\n") ?? "";
  if (/AccountNotInitialized/.test(logs)) {
    if (/depositor_mim|donor_mim/.test(logs)) {
      return `Your wallet does not have an initialized ${reserveSymbol.value} token account. Receive ${reserveSymbol.value}, then refresh.`;
    }
    if (/owner_mana/.test(logs)) {
      return "Your wallet does not have an initialized MANA token account.";
    }
  }

  if (/insufficient funds|insufficient.*funds/i.test(logs)) {
    return "The wallet does not have enough token balance or SOL for this transaction.";
  }

  return "The transaction did not pass the network check. Review balances and try again.";
}

const MetricTile = defineComponent({
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true },
    subValue: { type: String, default: "" },
    tone: { type: String as PropType<"reserve" | "mana" | "neutral">, default: "neutral" },
    loading: { type: Boolean, default: false },
  },
  setup(props) {
    const subValue = () =>
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(props.subValue)
        ? shortAddress(props.subValue)
        : props.subValue;

    return () =>
      h("article", { class: "rounded-lg border border-black/10 bg-white p-4 shadow-sm" }, [
        h("div", { class: "mb-3 flex items-center justify-between gap-3" }, [
          h("p", { class: "text-sm font-bold text-black/55" }, props.label),
          h("span", {
            class: [
              "size-3 rounded-full",
              props.tone === "reserve"
                ? "bg-mim"
                : props.tone === "mana"
                  ? "bg-mana"
                  : "bg-black/20",
            ],
          }),
        ]),
        h(
          "p",
          { class: "min-h-8 break-words text-2xl font-black tracking-normal" },
          props.loading ? "..." : props.value
        ),
        h(
          "p",
          { class: "mt-2 truncate text-xs font-semibold text-black/45" },
          props.subValue ? subValue() : "n/a"
        ),
      ]);
  },
});

const VaultTile = defineComponent({
  props: {
    label: { type: String, required: true },
    amount: { type: String, required: true },
    address: { type: String, default: "" },
    config: { type: Object as PropType<ClusterConfig>, required: true },
  },
  setup(props) {
    return () =>
      h("article", { class: "rounded-lg border border-black/10 bg-field p-3" }, [
        h("p", { class: "text-xs font-black uppercase tracking-normal text-black/45" }, props.label),
        h("p", { class: "mt-2 min-h-7 break-words text-lg font-black" }, props.amount),
        props.address
          ? h(
              "a",
              {
                class: "mt-3 inline-flex max-w-full items-center gap-1 text-xs font-black text-black/55 underline",
                href: explorerUrl(props.config, props.address),
                target: "_blank",
                rel: "noreferrer",
              },
              [h("span", { class: "truncate" }, shortAddress(props.address)), h(ExternalLink, { class: "size-3" })]
            )
          : h("p", { class: "mt-3 text-xs font-semibold text-black/40" }, "n/a"),
      ]);
  },
});

const BalanceTile = defineComponent({
  props: {
    symbol: { type: String, required: true },
    amount: { type: String, required: true },
    address: { type: String, default: "" },
    exists: { type: Boolean, default: false },
    connected: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    config: { type: Object as PropType<ClusterConfig>, required: true },
    tone: { type: String as PropType<"reserve" | "mana">, required: true },
  },
  setup(props) {
    const status = () => {
      if (props.loading) return "Loading wallet balances";
      if (!props.connected) return "Connect wallet";
      if (!props.exists) return "Token account not initialized";
      return "";
    };

    return () =>
      h("article", { class: "rounded-lg border border-black/10 bg-field p-3" }, [
        h("div", { class: "flex items-center justify-between gap-3" }, [
          h("p", { class: "text-sm font-black" }, props.symbol),
          h("span", {
            class: [
              "size-3 rounded-full",
              props.tone === "reserve" ? "bg-mim" : "bg-mana",
            ],
          }),
        ]),
        h("p", { class: "mt-2 min-h-8 break-words text-2xl font-black" }, props.amount),
        props.address && props.exists
          ? h(
              "a",
              {
                class: "mt-2 inline-flex max-w-full items-center gap-1 text-xs font-black text-black/55 underline",
                href: explorerUrl(props.config, props.address),
                target: "_blank",
                rel: "noreferrer",
              },
              [h("span", { class: "truncate" }, shortAddress(props.address)), h(ExternalLink, { class: "size-3" })]
            )
          : h("p", { class: "mt-2 text-xs font-semibold text-black/40" }, status()),
      ]);
  },
});

const ActionPanel = defineComponent({
  emits: ["update:inputValue", "submit"],
  props: {
    title: { type: String, required: true },
    icon: { type: [Object, Function] as PropType<Component>, required: true },
    disabled: { type: Boolean, default: false },
    busy: { type: Boolean, default: false },
    inputValue: { type: String, required: true },
    inputLabel: { type: String, required: true },
    buttonLabel: { type: String, required: true },
    preview: { type: String, default: "" },
    message: { type: String, default: "" },
  },
  setup(props, { emit }) {
    return () =>
      h("section", { class: "rounded-lg border border-black/10 bg-white p-4 shadow-sm" }, [
        h("div", { class: "mb-3 flex items-center justify-between gap-3" }, [
          h("div", { class: "flex items-center gap-2" }, [
            h(props.icon, { class: "size-5 text-ink" }),
            h("h2", { class: "text-lg font-black" }, props.title),
          ]),
          props.preview
            ? h("span", { class: "rounded-md bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700" }, props.preview)
            : null,
        ]),
        h("label", { class: "grid gap-2" }, [
          h("span", { class: "text-xs font-black uppercase tracking-normal text-black/45" }, props.inputLabel),
          h("input", {
            class: "h-11 w-full rounded-lg border border-black/10 bg-field px-3 text-base font-black outline-none transition focus:border-ink",
            inputmode: "decimal",
            placeholder: "0.00",
            value: props.inputValue,
            disabled: props.busy,
            onInput: (event: Event) =>
              emit("update:inputValue", (event.target as HTMLInputElement).value),
          }),
        ]),
        h(
          "button",
          {
            type: "button",
            class:
              "mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-black text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-black/20",
            disabled: props.disabled || props.busy || !props.inputValue.trim(),
            onClick: () => emit("submit"),
          },
          [
            props.busy
              ? h(Loader2, { class: "size-4 animate-spin" })
              : h(Send, { class: "size-4" }),
            props.buttonLabel,
          ]
        ),
        props.message
          ? h("p", { class: "mt-3 text-sm font-semibold text-black/55" }, props.message)
          : null,
      ]);
  },
});
</script>
