<template>
  <main
    class="overflow-hidden text-slate-100"
    :class="embedded ? 'min-h-0 bg-transparent' : 'min-h-screen bg-night'"
  >
    <div
      v-if="!embedded"
      class="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(53,215,255,0.18),transparent_28%),radial-gradient(circle_at_78%_15%,rgba(157,108,255,0.16),transparent_30%),linear-gradient(135deg,rgba(5,150,105,0.12),transparent_45%)]"
      aria-hidden="true"
    />

    <section
      class="relative mx-auto flex w-full flex-col gap-5"
      :class="embedded ? '' : 'max-w-7xl px-4 py-4 sm:px-6 lg:px-8'"
    >
      <header
        v-if="!embedded"
        class="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between"
      >
        <div class="flex min-w-0 items-center gap-3">
          <div
            class="grid size-11 shrink-0 place-items-center rounded-lg border border-cyan-ray/40 bg-cyan-ray/10 text-cyan-ray shadow-[0_0_35px_rgba(53,215,255,0.18)]"
          >
            <Waves class="size-5" aria-hidden="true" />
          </div>
          <div class="min-w-0">
            <h1
              class="truncate text-2xl font-black tracking-normal sm:text-3xl"
            >
              MIM DEX
            </h1>
            <div
              class="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-300"
            >
              <span
                class="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-bold"
              >
                CP-Swap
              </span>
              <span
                class="rounded-md border px-2 py-1 font-bold"
                :class="
                  isDeployed
                    ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
                    : 'border-amber-300/30 bg-amber-400/10 text-amber-200'
                "
              >
                {{ isDeployed ? "Devnet live" : "Disabled" }}
              </span>
              <span
                class="rounded-md border border-cyan-ray/25 bg-cyan-ray/10 px-2 py-1 font-bold text-cyan-100"
              >
                {{ pools.length }} pools
              </span>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div
            class="grid grid-cols-2 rounded-lg border border-white/10 bg-white/5 p-1"
          >
            <button
              v-for="option in clusterOptions"
              :key="option"
              type="button"
              class="rounded-md px-4 py-2 text-sm font-bold transition"
              :class="
                cluster === option
                  ? 'bg-cyan-ray text-slate-950'
                  : 'text-slate-300 hover:bg-white/10'
              "
              @click="selectCluster(option)"
            >
              {{ getClusterConfig(option).label }}
            </button>
          </div>
          <WalletMultiButton />
        </div>
      </header>

      <section
        v-if="walletErrorMessage && !embedded"
        class="rounded-lg border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100"
      >
        {{ walletErrorMessage }}
      </section>
      <section
        v-if="loadError"
        class="rounded-lg border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-100"
      >
        {{ loadError }}
      </section>
      <section
        v-if="lastSignature"
        class="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100"
      >
        <CheckCircle2 class="size-4" aria-hidden="true" />
        <span>{{ lastActionLabel }}</span>
        <a
          class="font-black text-cyan-100 underline-offset-4 hover:underline"
          :href="explorerUrl(config, lastSignature, 'tx')"
          target="_blank"
          rel="noreferrer"
        >
          {{ shortAddress(lastSignature, 6) }}
        </a>
      </section>

      <nav
        v-if="!embedded"
        class="grid grid-cols-4 gap-2 rounded-lg border border-white/10 bg-white/5 p-1"
      >
        <button
          v-for="option in tabs"
          :key="option.value"
          type="button"
          class="flex h-10 items-center justify-center gap-2 rounded-md text-sm font-black transition"
          :class="
            activeTab === option.value
              ? 'bg-white text-slate-950'
              : 'text-slate-300 hover:bg-white/10'
          "
          @click="activeTab = option.value"
        >
          <component :is="option.icon" class="size-4" aria-hidden="true" />
          <span class="hidden sm:inline">{{ option.label }}</span>
        </button>
      </nav>

      <section
        class="grid gap-5"
        :class="compact ? '' : 'lg:grid-cols-[minmax(0,1fr)_380px]'"
      >
        <div class="grid gap-5">
          <section
            v-if="activeTab === 'swap'"
            class="rounded-lg border border-cyan-ray/25 bg-panel/90 p-4 shadow-[0_18px_80px_rgba(0,0,0,0.32)]"
          >
            <div class="mb-4 flex items-center justify-between gap-3">
              <h2 class="text-xl font-black">Swap</h2>
              <button
                type="button"
                class="grid size-9 place-items-center rounded-md border border-white/10 text-slate-300 transition hover:bg-white/10"
                title="Refresh pools"
                :disabled="loadingPools"
                @click="refreshPools"
              >
                <RefreshCw
                  class="size-4"
                  :class="{ 'animate-spin': loadingPools }"
                  aria-hidden="true"
                />
              </button>
            </div>

            <TokenAmountPanel
              label="From"
              v-model:amount="forms.swapAmount"
              v-model:mint="forms.inputMint"
              :tokens="tokenOptions"
              :balance="inputBalanceText"
              @max="setSwapMax"
              @half="setSwapHalf"
            />
            <div class="my-2 flex justify-center">
              <button
                type="button"
                class="grid size-10 place-items-center rounded-full border border-cyan-ray/35 bg-cyan-ray/15 text-cyan-100 transition hover:bg-cyan-ray/25"
                title="Flip swap direction"
                @click="flipSwapTokens"
              >
                <ArrowDownUp class="size-4" aria-hidden="true" />
              </button>
            </div>
            <TokenAmountPanel
              label="To"
              :amount="swapOutputText"
              :mint="forms.outputMint"
              :tokens="tokenOptions"
              :readonly-amount="true"
              :balance="outputBalanceText"
              @update:mint="forms.outputMint = $event"
            />

            <div
              class="mt-4 grid gap-2 rounded-lg border border-white/10 bg-night/45 p-3 text-sm"
            >
              <InfoRow
                label="Pool"
                :value="
                  quoteState.pool ? poolLabel(quoteState.pool) : 'No route'
                "
              />
              <InfoRow label="Minimum received" :value="minimumReceivedText" />
              <InfoRow
                label="Base fee"
                :value="
                  quoteState.pool
                    ? poolFeeText(quoteState.pool.poolTradeFeeRate)
                    : '--'
                "
              />
              <InfoRow label="Price impact" :value="priceImpactText" />
            </div>

            <button
              type="button"
              class="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-cyan-ray text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              :disabled="Boolean(swapActionIssue) || busyAction !== null"
              :title="swapActionIssue"
              @click="prepareSwap"
            >
              <ArrowRightLeft class="size-4" aria-hidden="true" />
              {{ walletConnected ? "Review swap" : "Connect wallet" }}
            </button>
          </section>

          <section
            v-if="activeTab === 'pools'"
            class="rounded-lg border border-white/10 bg-panel/90 p-4"
          >
            <div
              class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <h2 class="text-xl font-black">Pools</h2>
              <div
                class="flex items-center gap-2 rounded-lg border border-white/10 bg-night/50 px-3"
              >
                <Search class="size-4 text-slate-400" aria-hidden="true" />
                <input
                  v-model="forms.poolSearch"
                  class="h-10 min-w-0 bg-transparent text-sm outline-none placeholder:text-slate-500"
                  placeholder="Mint or pool"
                />
              </div>
            </div>

            <div class="grid gap-3">
              <PoolRow
                v-for="pool in filteredPools"
                :key="pool.address"
                :pool="pool"
                :selected="pool.address === selectedPoolAddress"
                :config="config"
                @select="usePool(pool)"
              />
              <EmptyState
                v-if="!filteredPools.length"
                :loading="loadingPools"
                label="No pools found"
              />
            </div>
          </section>

          <section v-if="activeTab === 'liquidity'" class="grid gap-4">
            <div
              v-if="liquidityPanel !== 'manage'"
              class="rounded-lg border border-white/10 bg-panel/90 p-4"
            >
              <div class="mb-4 flex items-center justify-between gap-3">
                <h2 class="text-xl font-black">Create pool</h2>
                <span
                  class="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-black text-slate-300"
                  >Max 5%</span
                >
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <Field label="Token A mint" v-model="forms.createMintA" />
                <Field label="Token B mint" v-model="forms.createMintB" />
                <Field label="Token A amount" v-model="forms.createAmountA" />
                <Field label="Token B amount" v-model="forms.createAmountB" />
                <Field label="Base fee %" v-model="forms.createFeePercent" />
              </div>
              <button
                type="button"
                class="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-mint-ray text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
                :disabled="Boolean(createPoolIssue) || busyAction !== null"
                :title="createPoolIssue"
                @click="prepareCreatePool"
              >
                <Plus class="size-4" aria-hidden="true" />
                Review pool
              </button>
            </div>

            <div
              v-if="liquidityPanel !== 'create'"
              class="grid gap-4 xl:grid-cols-2"
            >
              <div class="rounded-lg border border-white/10 bg-panel/90 p-4">
                <h2 class="mb-4 text-xl font-black">Deposit</h2>
                <PoolSelect v-model="selectedPoolAddress" :pools="pools" />
                <Field
                  class="mt-3"
                  label="LP tokens to mint"
                  v-model="forms.depositLp"
                />
                <div
                  class="mt-4 grid gap-2 rounded-lg border border-white/10 bg-night/45 p-3 text-sm"
                >
                  <InfoRow
                    label="Token 0 max"
                    :value="depositPreviewText.token0"
                  />
                  <InfoRow
                    label="Token 1 max"
                    :value="depositPreviewText.token1"
                  />
                </div>
                <button
                  type="button"
                  class="mt-4 h-11 w-full rounded-lg bg-cyan-ray text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
                  :disabled="Boolean(depositIssue) || busyAction !== null"
                  :title="depositIssue"
                  @click="prepareDeposit"
                >
                  Review deposit
                </button>
              </div>

              <div class="rounded-lg border border-white/10 bg-panel/90 p-4">
                <h2 class="mb-4 text-xl font-black">Withdraw</h2>
                <PoolSelect v-model="selectedPoolAddress" :pools="pools" />
                <Field
                  class="mt-3"
                  label="LP tokens to burn"
                  v-model="forms.withdrawLp"
                />
                <div class="mt-3 grid grid-cols-4 gap-2">
                  <button
                    v-for="percent in [25, 50, 75, 100]"
                    :key="percent"
                    type="button"
                    class="h-9 rounded-md border border-white/10 bg-white/5 text-xs font-black text-slate-300 hover:bg-white/10"
                    @click="setWithdrawPercent(percent)"
                  >
                    {{ percent }}%
                  </button>
                </div>
                <div
                  class="mt-4 grid gap-2 rounded-lg border border-white/10 bg-night/45 p-3 text-sm"
                >
                  <InfoRow
                    label="Token 0 min"
                    :value="withdrawPreviewText.token0"
                  />
                  <InfoRow
                    label="Token 1 min"
                    :value="withdrawPreviewText.token1"
                  />
                </div>
                <button
                  type="button"
                  class="mt-4 h-11 w-full rounded-lg bg-orchid text-sm font-black text-white transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
                  :disabled="Boolean(withdrawIssue) || busyAction !== null"
                  :title="withdrawIssue"
                  @click="prepareWithdraw"
                >
                  Review withdraw
                </button>
              </div>
            </div>
          </section>

          <section
            v-if="activeTab === 'portfolio'"
            class="rounded-lg border border-white/10 bg-panel/90 p-4"
          >
            <h2 class="mb-4 text-xl font-black">Portfolio</h2>
            <div class="grid gap-3">
              <article
                v-for="pool in portfolioPools"
                :key="pool.address"
                class="rounded-lg border border-white/10 bg-night/45 p-4"
              >
                <div
                  class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <h3 class="font-black">{{ poolLabel(pool) }}</h3>
                    <p class="mt-1 text-xs font-semibold text-slate-400">
                      {{ shortAddress(pool.address, 6) }}
                    </p>
                  </div>
                  <div class="text-right text-sm">
                    <div class="font-black">
                      {{ formatTokenAmount(pool.walletLpBalance ?? 0n, 9, 6) }}
                      LP
                    </div>
                    <div class="text-slate-400">
                      {{ (pool.walletShareBps ?? 0) / 100 }}% share
                    </div>
                  </div>
                </div>
                <div class="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <InfoPill
                    label="Token 0"
                    :value="
                      formatSideAmount(
                        pool.sides[0].availableAmount,
                        pool.sides[0]
                      )
                    "
                  />
                  <InfoPill
                    label="Token 1"
                    :value="
                      formatSideAmount(
                        pool.sides[1].availableAmount,
                        pool.sides[1]
                      )
                    "
                  />
                  <InfoPill label="Basis" :value="positionBasisLabel(pool)" />
                </div>
              </article>
              <EmptyState
                v-if="!portfolioPools.length"
                :loading="loadingPools"
                label="No LP positions"
              />
            </div>
          </section>
        </div>

        <aside v-if="!compact" class="grid content-start gap-4">
          <section class="rounded-lg border border-white/10 bg-panel/90 p-4">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="font-black">Route</h2>
              <span class="text-xs font-bold text-slate-400">{{
                walletStatus
              }}</span>
            </div>
            <div class="grid gap-2 text-sm">
              <InfoRow
                label="Selected pool"
                :value="selectedPool ? poolLabel(selectedPool) : 'None'"
              />
              <InfoRow
                label="LP supply"
                :value="
                  selectedPool
                    ? formatTokenAmount(selectedPool.lpSupply, 9, 4)
                    : '--'
                "
              />
              <InfoRow
                label="Open"
                :value="
                  selectedPool
                    ? selectedPool.isOpen
                      ? 'Yes'
                      : 'Pending'
                    : '--'
                "
              />
              <InfoRow
                label="Wallet LP"
                :value="
                  selectedPool
                    ? formatTokenAmount(
                        selectedPool.walletLpBalance ?? 0n,
                        9,
                        6
                      )
                    : '--'
                "
              />
            </div>
          </section>

          <section class="rounded-lg border border-white/10 bg-panel/90 p-4">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="font-black">Balances</h2>
              <button
                type="button"
                class="grid size-8 place-items-center rounded-md border border-white/10 text-slate-300 transition hover:bg-white/10"
                title="Refresh balances"
                @click="refreshBalances"
              >
                <RefreshCw class="size-4" aria-hidden="true" />
              </button>
            </div>
            <div class="grid gap-2 text-sm">
              <InfoRow label="Input" :value="inputBalanceText" />
              <InfoRow label="Output" :value="outputBalanceText" />
            </div>
          </section>
        </aside>
      </section>
    </section>

    <section
      v-if="confirmation"
      class="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6"
    >
      <div
        class="w-full max-w-lg rounded-lg border border-white/10 bg-panel p-5 shadow-2xl"
      >
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 class="text-xl font-black">{{ confirmation.title }}</h2>
            <p class="mt-1 text-sm font-semibold text-slate-400">
              {{ config.label }}
            </p>
          </div>
          <button
            type="button"
            class="grid size-9 place-items-center rounded-md border border-white/10 text-slate-300 hover:bg-white/10"
            @click="confirmation = null"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>
        <div
          class="grid gap-2 rounded-lg border border-white/10 bg-night/45 p-3 text-sm"
        >
          <InfoRow
            v-for="row in confirmation.rows"
            :key="row.label"
            :label="row.label"
            :value="row.value"
          />
        </div>
        <div
          class="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold"
          :class="
            confirmation.simulation.err
              ? 'border-red-300/30 bg-red-400/10 text-red-100'
              : 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100'
          "
        >
          Simulation {{ confirmation.simulation.err ? "failed" : "passed" }}
          <span v-if="!confirmation.simulation.err">
            · {{ confirmation.simulation.unitsConsumed ?? "unknown" }} CU</span
          >
        </div>
        <pre
          v-if="confirmation.simulation.err"
          class="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-xs text-red-100"
          >{{ errorMessage(confirmation.simulation.err) }}</pre
        >
        <div class="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            class="h-11 rounded-lg border border-white/10 text-sm font-black text-slate-200 hover:bg-white/10"
            @click="confirmation = null"
          >
            Cancel
          </button>
          <button
            type="button"
            class="h-11 rounded-lg bg-cyan-ray text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
            :disabled="sending || Boolean(confirmation.simulation.err)"
            @click="sendConfirmed"
          >
            {{ sending ? "Sending" : "Send" }}
          </button>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { PublicKey, Transaction } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-vue";
import { WalletMultiButton } from "@solana/wallet-adapter-vue-ui";
import {
  ArrowDownUp,
  ArrowRightLeft,
  CheckCircle2,
  Layers3,
  Plus,
  RefreshCw,
  Search,
  WalletCards,
  Waves,
  X,
} from "lucide-vue-next";
import {
  computed,
  defineComponent,
  h,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import {
  CLUSTERS,
  DEFAULT_CLUSTER,
  DEVNET_SMOKE_POOL,
  explorerUrl,
  getClusterConfig,
  isDeployedConfig,
  shortAddress,
  type ClusterName,
} from "../lib/config";
import {
  assertDexDeployed,
  buildDepositTransaction,
  buildInitializePoolTransaction,
  buildSwapBaseInputTransaction,
  buildWithdrawTransaction,
  createConnection,
  filterPoolsByPair,
  loadMintSnapshot,
  loadPoolSnapshots,
  prepareDexTransaction,
  previewPoolDeposit,
  previewPoolWithdraw,
  quotePoolSwap,
  selectBestPoolForSwap,
  type PoolSideSnapshot,
  type PoolSnapshot,
  type PreparedDexTransaction,
} from "../lib/cp-swap-client";
import {
  formatPercentBps,
  formatTokenAmount,
  parseUiAmount,
  poolFeeRateToPercent,
  validatePoolFeeRate,
} from "../lib/amounts";
import { positionBasisLabel, savePositionBasis } from "../lib/positions";

type Tab = "swap" | "pools" | "liquidity" | "portfolio";
type ActionKind = "swap" | "createPool" | "deposit" | "withdraw";
type Confirmation = {
  kind: ActionKind;
  title: string;
  rows: Array<{ label: string; value: string }>;
  transaction: Transaction;
  simulation: PreparedDexTransaction["simulation"];
  afterSend?: () => void;
};

const props = withDefaults(
  defineProps<{
    walletErrorMessage?: string;
    embedded?: boolean;
    compact?: boolean;
    clusterName?: ClusterName;
    forcedTab?: Tab;
    liquidityPanel?: "all" | "create" | "manage";
  }>(),
  {
    walletErrorMessage: "",
    embedded: false,
    compact: false,
    liquidityPanel: "all",
  }
);
const wallet = useWallet();
const embedded = computed(() => props.embedded);
const compact = computed(() => props.compact);
const liquidityPanel = computed(() => props.liquidityPanel);
const clusterOptions = CLUSTERS;
const cluster = ref<ClusterName>(props.clusterName ?? DEFAULT_CLUSTER);
const activeTab = ref<Tab>(props.forcedTab ?? "swap");
const pools = ref<PoolSnapshot[]>([]);
const loadingPools = ref(false);
const loadError = ref("");
const selectedPoolAddress = ref("");
const lastSignature = ref("");
const lastActionLabel = ref("");
const busyAction = ref<ActionKind | null>(null);
const sending = ref(false);
const confirmation = ref<Confirmation | null>(null);
const balances = reactive<Record<string, bigint>>({});
const forms = reactive({
  inputMint: "",
  outputMint: "",
  swapAmount: "",
  poolSearch: "",
  createMintA: "",
  createMintB: "",
  createAmountA: "",
  createAmountB: "",
  createFeePercent: "0.25",
  depositLp: "",
  withdrawLp: "",
});

const tabs = [
  { value: "swap" as const, label: "Swap", icon: ArrowRightLeft },
  { value: "pools" as const, label: "Pools", icon: Layers3 },
  { value: "liquidity" as const, label: "Liquidity", icon: Plus },
  { value: "portfolio" as const, label: "Portfolio", icon: WalletCards },
];

const config = computed(() => getClusterConfig(cluster.value));
const connection = computed(() => createConnection(config.value));
const isDeployed = computed(() => isDeployedConfig(config.value));
const walletConnected = computed(
  () => wallet.connected.value && Boolean(wallet.publicKey.value)
);
const walletStatus = computed(() =>
  wallet.publicKey.value
    ? shortAddress(wallet.publicKey.value.toString(), 5)
    : "Disconnected"
);
const selectedPool = computed(
  () =>
    pools.value.find((pool) => pool.address === selectedPoolAddress.value) ??
    pools.value[0] ??
    null
);
const tokenOptions = computed(() => {
  const byMint = new Map<
    string,
    { mint: string; symbol: string; decimals: number }
  >();
  for (const token of config.value.knownTokens) {
    byMint.set(token.mint, {
      mint: token.mint,
      symbol: token.symbol,
      decimals: token.decimals,
    });
  }
  for (const pool of pools.value) {
    for (const side of pool.sides) {
      byMint.set(side.mint, {
        mint: side.mint,
        symbol: side.symbol,
        decimals: side.decimals,
      });
    }
  }
  return [...byMint.values()];
});
const inputToken = computed(() =>
  tokenOptions.value.find((token) => token.mint === forms.inputMint)
);
const outputToken = computed(() =>
  tokenOptions.value.find((token) => token.mint === forms.outputMint)
);
const matchingPools = computed(() =>
  forms.inputMint && forms.outputMint
    ? filterPoolsByPair(pools.value, forms.inputMint, forms.outputMint)
    : []
);
const quoteState = computed(() => {
  try {
    if (!forms.swapAmount || !inputToken.value || !outputToken.value) {
      return { pool: null, quote: null, error: "" };
    }
    const amount = parseUiAmount(forms.swapAmount, inputToken.value.decimals);
    const best = selectBestPoolForSwap(
      pools.value,
      forms.inputMint,
      forms.outputMint,
      amount,
      config.value.defaultSlippageBps
    );
    return best
      ? { pool: best.pool, quote: best.quote, error: "" }
      : { pool: null, quote: null, error: "No direct pool for this pair." };
  } catch (error) {
    return { pool: null, quote: null, error: errorMessage(error) };
  }
});
const swapOutputText = computed(() =>
  quoteState.value.quote && outputToken.value
    ? formatTokenAmount(
        quoteState.value.quote.outputAmount,
        outputToken.value.decimals,
        6
      )
    : ""
);
const minimumReceivedText = computed(() =>
  quoteState.value.quote && outputToken.value
    ? `${formatTokenAmount(
        quoteState.value.quote.minimumOutputAmount,
        outputToken.value.decimals,
        6
      )} ${outputToken.value.symbol}`
    : "--"
);
const priceImpactText = computed(() =>
  quoteState.value.quote
    ? formatPercentBps(quoteState.value.quote.priceImpactBps)
    : "--"
);
const inputBalanceText = computed(() =>
  balanceText(forms.inputMint, inputToken.value?.decimals)
);
const outputBalanceText = computed(() =>
  balanceText(forms.outputMint, outputToken.value?.decimals)
);
const swapActionIssue = computed(() => {
  if (!walletConnected.value) return "Connect a wallet.";
  if (!isDeployed.value) return "DEX is disabled on this cluster.";
  if (!forms.inputMint || !forms.outputMint) return "Select a token pair.";
  if (forms.inputMint === forms.outputMint) return "Select different tokens.";
  if (!quoteState.value.quote || !quoteState.value.pool) {
    return quoteState.value.error || "Enter an amount.";
  }
  return "";
});
const filteredPools = computed(() => {
  const needle = forms.poolSearch.trim().toLowerCase();
  if (!needle) return pools.value;
  return pools.value.filter((pool) =>
    [
      pool.address,
      pool.lpMint,
      pool.sides[0].mint,
      pool.sides[1].mint,
      pool.sides[0].symbol,
      pool.sides[1].symbol,
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle)
  );
});
const portfolioPools = computed(() =>
  pools.value.filter((pool) => (pool.walletLpBalance ?? 0n) > 0n)
);
const createPoolIssue = computed(() => {
  if (!walletConnected.value) return "Connect a wallet.";
  if (!isDeployed.value) return "DEX is disabled on this cluster.";
  try {
    new PublicKey(forms.createMintA.trim());
    new PublicKey(forms.createMintB.trim());
    if (forms.createMintA.trim() === forms.createMintB.trim()) {
      return "Token mints must be different.";
    }
    parseUiAmount(forms.createAmountA, 12);
    parseUiAmount(forms.createAmountB, 12);
    validatePoolFeeRate(parseFeePercent(forms.createFeePercent));
    return "";
  } catch (error) {
    return errorMessage(error);
  }
});
const depositIssue = computed(() => {
  if (!walletConnected.value) return "Connect a wallet.";
  if (!selectedPool.value) return "Select a pool.";
  if (!selectedPool.value.canDeposit) return "Pool deposits are disabled.";
  try {
    parseUiAmount(forms.depositLp, 9);
    return "";
  } catch (error) {
    return errorMessage(error);
  }
});
const withdrawIssue = computed(() => {
  if (!walletConnected.value) return "Connect a wallet.";
  if (!selectedPool.value) return "Select a pool.";
  if (!selectedPool.value.canWithdraw) return "Pool withdrawals are disabled.";
  try {
    const amount = parseUiAmount(forms.withdrawLp, 9);
    if (amount > (selectedPool.value.walletLpBalance ?? 0n)) {
      return "Amount exceeds wallet LP balance.";
    }
    return "";
  } catch (error) {
    return errorMessage(error);
  }
});
const depositPreviewText = computed(() => {
  try {
    if (!selectedPool.value) return { token0: "--", token1: "--" };
    const preview = previewPoolDeposit(
      selectedPool.value,
      parseUiAmount(forms.depositLp, 9),
      config.value.defaultSlippageBps
    );
    return {
      token0: formatSideAmount(
        preview.maxToken0Amount,
        selectedPool.value.sides[0]
      ),
      token1: formatSideAmount(
        preview.maxToken1Amount,
        selectedPool.value.sides[1]
      ),
    };
  } catch {
    return { token0: "--", token1: "--" };
  }
});
const withdrawPreviewText = computed(() => {
  try {
    if (!selectedPool.value) return { token0: "--", token1: "--" };
    const preview = previewPoolWithdraw(
      selectedPool.value,
      parseUiAmount(forms.withdrawLp, 9),
      config.value.defaultSlippageBps
    );
    return {
      token0: formatSideAmount(
        preview.minToken0Amount,
        selectedPool.value.sides[0]
      ),
      token1: formatSideAmount(
        preview.minToken1Amount,
        selectedPool.value.sides[1]
      ),
    };
  } catch {
    return { token0: "--", token1: "--" };
  }
});

watch(
  () => props.clusterName,
  (next) => {
    if (next && next !== cluster.value) {
      cluster.value = next;
      confirmation.value = null;
      lastSignature.value = "";
    }
  }
);

watch(
  () => props.forcedTab,
  (next) => {
    if (next) {
      activeTab.value = next;
    }
  },
  { immediate: true }
);

watch(
  [cluster, wallet.publicKey],
  () => {
    void refreshPools();
  },
  { immediate: true }
);

watch(
  pools,
  () => {
    applyDefaultPair();
    void refreshBalances();
  },
  { immediate: true }
);

onMounted(() => {
  if (!forms.createMintA && config.value.treasury?.reserveMint) {
    forms.createMintA = config.value.treasury.reserveMint;
  }
});

function selectCluster(next: ClusterName) {
  cluster.value = next;
  confirmation.value = null;
  lastSignature.value = "";
}

async function refreshPools() {
  pools.value = [];
  loadError.value = "";
  if (!isDeployedConfig(config.value)) return;

  loadingPools.value = true;
  try {
    pools.value = await loadPoolSnapshots(
      connection.value,
      config.value,
      wallet.publicKey.value
    );
    selectedPoolAddress.value =
      pools.value.find((pool) => pool.address === DEVNET_SMOKE_POOL)?.address ??
      pools.value[0]?.address ??
      "";
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    loadingPools.value = false;
  }
}

async function refreshBalances() {
  if (!wallet.publicKey.value) return;
  for (const token of [inputToken.value, outputToken.value]) {
    if (!token) continue;
    balances[token.mint] = await loadWalletBalance(token.mint, token.decimals);
  }
}

async function loadWalletBalance(
  mint: string,
  _decimals: number
): Promise<bigint> {
  if (!wallet.publicKey.value) return 0n;
  try {
    const token = tokenOptions.value.find((entry) => entry.mint === mint);
    if (!token) return 0n;
    const mintSnapshot = await loadMintSnapshot(
      connection.value,
      config.value,
      mint
    );
    const { getAccount, getAssociatedTokenAddressSync } = await import(
      "@solana/spl-token"
    );
    const ata = getAssociatedTokenAddressSync(
      new PublicKey(mint),
      wallet.publicKey.value,
      false,
      new PublicKey(mintSnapshot.tokenProgram)
    );
    return (
      await getAccount(
        connection.value,
        ata,
        "confirmed",
        new PublicKey(mintSnapshot.tokenProgram)
      )
    ).amount;
  } catch {
    return 0n;
  }
}

function applyDefaultPair() {
  if (forms.inputMint && forms.outputMint) return;
  const reserveMint = config.value.treasury?.reserveMint;
  const pool =
    pools.value.find((candidate) =>
      candidate.sides.some((side) => side.mint === reserveMint)
    ) ?? pools.value[0];
  if (!pool) {
    forms.inputMint = reserveMint ?? "";
    forms.outputMint = "";
    return;
  }
  const reserveSide = pool.sides.find((side) => side.mint === reserveMint);
  forms.inputMint = pool.sides[0].mint;
  forms.outputMint =
    reserveSide && pool.sides[0].mint !== reserveSide.mint
      ? reserveSide.mint
      : pool.sides[1].mint;
  forms.createMintA = reserveMint ?? pool.sides[0].mint;
  forms.createMintB =
    pool.sides.find((side) => side.mint !== reserveMint)?.mint ?? "";
}

function usePool(pool: PoolSnapshot) {
  selectedPoolAddress.value = pool.address;
  forms.inputMint = pool.sides[0].mint;
  forms.outputMint = pool.sides[1].mint;
  activeTab.value = "swap";
}

function flipSwapTokens() {
  const nextInput = forms.outputMint;
  forms.outputMint = forms.inputMint;
  forms.inputMint = nextInput;
  void refreshBalances();
}

function setSwapMax() {
  if (!inputToken.value) return;
  forms.swapAmount = formatTokenAmount(
    balances[forms.inputMint] ?? 0n,
    inputToken.value.decimals,
    inputToken.value.decimals
  ).replaceAll(",", "");
}

function setSwapHalf() {
  if (!inputToken.value) return;
  forms.swapAmount = formatTokenAmount(
    (balances[forms.inputMint] ?? 0n) / 2n,
    inputToken.value.decimals,
    inputToken.value.decimals
  ).replaceAll(",", "");
}

function setWithdrawPercent(percent: number) {
  if (!selectedPool.value) return;
  const amount =
    ((selectedPool.value.walletLpBalance ?? 0n) * BigInt(percent)) / 100n;
  forms.withdrawLp = formatTokenAmount(amount, 9, 9).replaceAll(",", "");
}

async function prepareSwap() {
  if (
    swapActionIssue.value ||
    !wallet.publicKey.value ||
    !quoteState.value.pool ||
    !quoteState.value.quote
  )
    return;
  await prepareAction("swap", async () => {
    const tx = await buildSwapBaseInputTransaction({
      connection: connection.value,
      config: deployedConfig(),
      owner: wallet.publicKey.value as PublicKey,
      pool: quoteState.value.pool as PoolSnapshot,
      inputMint: forms.inputMint,
      outputMint: forms.outputMint,
      amountIn: quoteState.value.quote!.inputAmount,
      minimumAmountOut: quoteState.value.quote!.minimumOutputAmount,
    });
    return {
      title: "Review swap",
      transaction: tx,
      rows: [
        {
          label: "Input",
          value: `${forms.swapAmount} ${inputToken.value?.symbol ?? ""}`,
        },
        {
          label: "Output",
          value: `${swapOutputText.value} ${outputToken.value?.symbol ?? ""}`,
        },
        { label: "Pool", value: quoteState.value.pool?.address ?? "" },
      ],
    };
  });
}

async function prepareCreatePool() {
  if (createPoolIssue.value || !wallet.publicKey.value) return;
  await prepareAction("createPool", async () => {
    const owner = wallet.publicKey.value as PublicKey;
    const mintA = await loadMintSnapshot(
      connection.value,
      config.value,
      forms.createMintA.trim()
    );
    const mintB = await loadMintSnapshot(
      connection.value,
      config.value,
      forms.createMintB.trim()
    );
    const amountA = parseUiAmount(forms.createAmountA, mintA.decimals);
    const amountB = parseUiAmount(forms.createAmountB, mintB.decimals);
    const poolTradeFeeRate = parseFeePercent(forms.createFeePercent);
    const tx = await buildInitializePoolTransaction(
      connection.value,
      deployedConfig(),
      owner,
      {
        tokenAMint: new PublicKey(mintA.mint),
        tokenAProgram: new PublicKey(mintA.tokenProgram),
        tokenASymbol: mintA.symbol,
        tokenBMint: new PublicKey(mintB.mint),
        tokenBProgram: new PublicKey(mintB.tokenProgram),
        tokenBSymbol: mintB.symbol,
        tokenAAmount: amountA,
        tokenBAmount: amountB,
        poolTradeFeeRate,
      }
    );
    return {
      title: "Review pool",
      transaction: tx,
      rows: [
        {
          label: "Token A",
          value: `${formatTokenAmount(amountA, mintA.decimals)} ${
            mintA.symbol
          }`,
        },
        {
          label: "Token B",
          value: `${formatTokenAmount(amountB, mintB.decimals)} ${
            mintB.symbol
          }`,
        },
        { label: "Base fee", value: poolFeeRateToPercent(poolTradeFeeRate) },
      ],
      afterSend: () => {
        forms.createAmountA = "";
        forms.createAmountB = "";
      },
    };
  });
}

async function prepareDeposit() {
  if (depositIssue.value || !wallet.publicKey.value || !selectedPool.value)
    return;
  await prepareAction("deposit", async () => {
    const lpAmount = parseUiAmount(forms.depositLp, 9);
    const preview = previewPoolDeposit(
      selectedPool.value as PoolSnapshot,
      lpAmount,
      config.value.defaultSlippageBps
    );
    const tx = await buildDepositTransaction({
      connection: connection.value,
      config: deployedConfig(),
      owner: wallet.publicKey.value as PublicKey,
      pool: selectedPool.value as PoolSnapshot,
      lpTokenAmount: lpAmount,
      maxToken0Amount: preview.maxToken0Amount,
      maxToken1Amount: preview.maxToken1Amount,
    });
    return {
      title: "Review deposit",
      transaction: tx,
      rows: [
        { label: "LP mint", value: formatTokenAmount(lpAmount, 9, 6) },
        {
          label: "Token 0 max",
          value: formatSideAmount(
            preview.maxToken0Amount,
            selectedPool.value!.sides[0]
          ),
        },
        {
          label: "Token 1 max",
          value: formatSideAmount(
            preview.maxToken1Amount,
            selectedPool.value!.sides[1]
          ),
        },
      ],
      afterSend: () => {
        savePositionBasis(
          selectedPool.value as PoolSnapshot,
          preview.token0Amount,
          preview.token1Amount,
          lpAmount
        );
        forms.depositLp = "";
      },
    };
  });
}

async function prepareWithdraw() {
  if (withdrawIssue.value || !wallet.publicKey.value || !selectedPool.value)
    return;
  await prepareAction("withdraw", async () => {
    const lpAmount = parseUiAmount(forms.withdrawLp, 9);
    const preview = previewPoolWithdraw(
      selectedPool.value as PoolSnapshot,
      lpAmount,
      config.value.defaultSlippageBps
    );
    const tx = await buildWithdrawTransaction({
      connection: connection.value,
      config: deployedConfig(),
      owner: wallet.publicKey.value as PublicKey,
      pool: selectedPool.value as PoolSnapshot,
      lpTokenAmount: lpAmount,
      minToken0Amount: preview.minToken0Amount,
      minToken1Amount: preview.minToken1Amount,
    });
    return {
      title: "Review withdraw",
      transaction: tx,
      rows: [
        { label: "LP burn", value: formatTokenAmount(lpAmount, 9, 6) },
        {
          label: "Token 0 min",
          value: formatSideAmount(
            preview.minToken0Amount,
            selectedPool.value!.sides[0]
          ),
        },
        {
          label: "Token 1 min",
          value: formatSideAmount(
            preview.minToken1Amount,
            selectedPool.value!.sides[1]
          ),
        },
      ],
      afterSend: () => {
        forms.withdrawLp = "";
      },
    };
  });
}

async function prepareAction(
  kind: ActionKind,
  factory: () => Promise<{
    title: string;
    rows: Confirmation["rows"];
    transaction: Transaction;
    afterSend?: () => void;
  }>
) {
  if (!wallet.publicKey.value) return;
  busyAction.value = kind;
  loadError.value = "";
  confirmation.value = null;
  try {
    const built = await factory();
    const prepared = await prepareDexTransaction(
      connection.value,
      built.transaction,
      wallet.publicKey.value
    );
    confirmation.value = {
      kind,
      title: built.title,
      rows: [
        { label: "Cluster", value: config.value.label },
        { label: "Wallet", value: wallet.publicKey.value.toString() },
        ...built.rows,
      ],
      transaction: prepared.transaction,
      simulation: prepared.simulation,
      afterSend: built.afterSend,
    };
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    busyAction.value = null;
  }
}

async function sendConfirmed() {
  if (!confirmation.value) return;
  sending.value = true;
  loadError.value = "";
  try {
    const signature = await wallet.sendTransaction(
      confirmation.value.transaction,
      connection.value,
      { skipPreflight: false, preflightCommitment: "confirmed" }
    );
    await connection.value.confirmTransaction(signature, "confirmed");
    lastSignature.value = signature;
    lastActionLabel.value = `${confirmation.value.title} sent`;
    confirmation.value.afterSend?.();
    confirmation.value = null;
    await refreshPools();
  } catch (error) {
    loadError.value = errorMessage(error);
  } finally {
    sending.value = false;
  }
}

function deployedConfig() {
  assertDexDeployed(config.value);
  return config.value;
}

function poolLabel(pool: PoolSnapshot): string {
  return `${pool.sides[0].symbol}/${pool.sides[1].symbol}`;
}

function poolFeeText(poolTradeFeeRate: number): string {
  return poolFeeRateToPercent(poolTradeFeeRate);
}

function formatSideAmount(amount: bigint, side: PoolSideSnapshot): string {
  return `${formatTokenAmount(amount, side.decimals, 6)} ${side.symbol}`;
}

function balanceText(mint: string, decimals?: number): string {
  if (!mint || decimals === undefined) return "--";
  return formatTokenAmount(balances[mint] ?? 0n, decimals, 6);
}

function parseFeePercent(value: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error("Pool fee must be numeric.");
  }
  const rate = Math.round(numeric * 10_000);
  validatePoolFeeRate(rate);
  return rate;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

const TokenAmountPanel = defineComponent({
  props: {
    label: { type: String, required: true },
    amount: { type: String, required: true },
    mint: { type: String, required: true },
    tokens: {
      type: Array as () => Array<{ mint: string; symbol: string }>,
      required: true,
    },
    balance: { type: String, default: "--" },
    readonlyAmount: { type: Boolean, default: false },
  },
  emits: ["update:amount", "update:mint", "max", "half"],
  setup(panelProps, { emit }) {
    return () =>
      h("div", { class: "rounded-lg border border-white/10 bg-night/55 p-4" }, [
        h(
          "div",
          {
            class:
              "mb-2 flex items-center justify-between text-xs font-bold text-slate-400",
          },
          [
            h("span", panelProps.label),
            h("span", `Balance: ${panelProps.balance}`),
          ]
        ),
        h("div", { class: "grid grid-cols-[minmax(0,1fr)_150px] gap-3" }, [
          h("input", {
            class:
              "min-w-0 bg-transparent text-2xl font-black outline-none placeholder:text-slate-600",
            value: panelProps.amount,
            readonly: panelProps.readonlyAmount,
            placeholder: "0.00",
            onInput: (event: Event) =>
              emit("update:amount", (event.target as HTMLInputElement).value),
          }),
          h(
            "select",
            {
              class:
                "h-11 rounded-lg border border-white/10 bg-panel-2 px-3 text-sm font-black outline-none",
              value: panelProps.mint,
              onChange: (event: Event) =>
                emit("update:mint", (event.target as HTMLSelectElement).value),
            },
            panelProps.tokens.map((token) =>
              h("option", { value: token.mint, key: token.mint }, token.symbol)
            )
          ),
        ]),
        h("div", { class: "mt-3 flex gap-2" }, [
          h(
            "button",
            {
              type: "button",
              class:
                "rounded-md border border-white/10 px-3 py-1 text-xs font-black text-slate-300 hover:bg-white/10",
              onClick: () => emit("max"),
            },
            "Max"
          ),
          h(
            "button",
            {
              type: "button",
              class:
                "rounded-md border border-white/10 px-3 py-1 text-xs font-black text-slate-300 hover:bg-white/10",
              onClick: () => emit("half"),
            },
            "50%"
          ),
        ]),
      ]);
  },
});

const InfoRow = defineComponent({
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true },
  },
  setup(rowProps) {
    return () =>
      h("div", { class: "flex items-center justify-between gap-3" }, [
        h("span", { class: "font-semibold text-slate-400" }, rowProps.label),
        h(
          "span",
          { class: "break-all text-right font-black text-slate-100" },
          rowProps.value
        ),
      ]);
  },
});

const InfoPill = defineComponent({
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true },
  },
  setup(pillProps) {
    return () =>
      h("div", { class: "rounded-lg border border-white/10 bg-white/5 p-3" }, [
        h(
          "div",
          { class: "text-xs font-bold text-slate-400" },
          pillProps.label
        ),
        h("div", { class: "mt-1 break-all font-black" }, pillProps.value),
      ]);
  },
});

const Field = defineComponent({
  props: {
    label: { type: String, required: true },
    modelValue: { type: String, required: true },
  },
  emits: ["update:modelValue"],
  setup(fieldProps, { emit, attrs }) {
    return () =>
      h("label", { class: ["block", attrs.class] }, [
        h(
          "span",
          { class: "mb-1 block text-xs font-bold text-slate-400" },
          fieldProps.label
        ),
        h("input", {
          class:
            "h-11 w-full rounded-lg border border-white/10 bg-night/55 px-3 text-sm font-bold text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-ray/60",
          value: fieldProps.modelValue,
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
        }),
      ]);
  },
});

const PoolSelect = defineComponent({
  props: {
    modelValue: { type: String, required: true },
    pools: { type: Array as () => PoolSnapshot[], required: true },
  },
  emits: ["update:modelValue"],
  setup(selectProps, { emit }) {
    return () =>
      h(
        "select",
        {
          class:
            "h-11 w-full rounded-lg border border-white/10 bg-night/55 px-3 text-sm font-black text-slate-100 outline-none",
          value: selectProps.modelValue,
          onChange: (event: Event) =>
            emit(
              "update:modelValue",
              (event.target as HTMLSelectElement).value
            ),
        },
        selectProps.pools.map((pool) =>
          h(
            "option",
            { value: pool.address, key: pool.address },
            `${pool.sides[0].symbol}/${pool.sides[1].symbol} · ${shortAddress(
              pool.address,
              5
            )}`
          )
        )
      );
  },
});

const PoolRow = defineComponent({
  props: {
    pool: { type: Object as () => PoolSnapshot, required: true },
    selected: { type: Boolean, required: true },
    config: { type: Object, required: true },
  },
  emits: ["select"],
  setup(rowProps, { emit }) {
    return () =>
      h(
        "article",
        {
          class: [
            "rounded-lg border p-4 transition",
            rowProps.selected
              ? "border-cyan-ray/50 bg-cyan-ray/10"
              : "border-white/10 bg-night/45 hover:bg-white/5",
          ],
        },
        [
          h(
            "div",
            {
              class:
                "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
            },
            [
              h("div", [
                h(
                  "h3",
                  { class: "font-black" },
                  `${rowProps.pool.sides[0].symbol}/${rowProps.pool.sides[1].symbol}`
                ),
                h(
                  "p",
                  { class: "mt-1 text-xs font-semibold text-slate-400" },
                  shortAddress(rowProps.pool.address, 6)
                ),
              ]),
              h("div", { class: "flex items-center gap-2" }, [
                h(
                  "a",
                  {
                    class:
                      "rounded-md border border-white/10 px-3 py-2 text-xs font-black text-slate-300 hover:bg-white/10",
                    href: explorerUrl(
                      rowProps.config as never,
                      rowProps.pool.address
                    ),
                    target: "_blank",
                    rel: "noreferrer",
                  },
                  "Explorer"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    class:
                      "rounded-md bg-cyan-ray px-3 py-2 text-xs font-black text-slate-950",
                    onClick: () => emit("select"),
                  },
                  "Use"
                ),
              ]),
            ]
          ),
          h("div", { class: "mt-3 grid gap-2 text-sm sm:grid-cols-4" }, [
            h(
              "span",
              { class: "rounded-md bg-white/5 px-2 py-1" },
              `Fee ${poolFeeRateToPercent(rowProps.pool.poolTradeFeeRate)}`
            ),
            h(
              "span",
              { class: "rounded-md bg-white/5 px-2 py-1" },
              `LP ${formatTokenAmount(rowProps.pool.lpSupply, 9, 2)}`
            ),
            h(
              "span",
              { class: "rounded-md bg-white/5 px-2 py-1" },
              rowProps.pool.canSwap ? "Swap on" : "Swap off"
            ),
            h(
              "span",
              { class: "rounded-md bg-white/5 px-2 py-1" },
              `Wallet ${formatTokenAmount(
                rowProps.pool.walletLpBalance ?? 0n,
                9,
                4
              )}`
            ),
          ]),
        ]
      );
  },
});

const EmptyState = defineComponent({
  props: {
    loading: { type: Boolean, default: false },
    label: { type: String, required: true },
  },
  setup(emptyProps) {
    return () =>
      h(
        "div",
        {
          class:
            "rounded-lg border border-dashed border-white/15 bg-white/5 p-6 text-center text-sm font-bold text-slate-400",
        },
        emptyProps.loading ? "Loading" : emptyProps.label
      );
  },
});
</script>
