<template>
  <button
    type="button"
    data-testid="token-selector-trigger"
    class="flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-white/10 bg-panel-2 px-3 text-left text-sm font-black text-slate-100 outline-none transition hover:bg-white/10 focus:border-cyan-ray/60"
    @click="openSelector"
  >
    <span v-if="selectedToken" class="flex min-w-0 items-center gap-2">
      <TokenAvatar :token="selectedToken" class="size-6 shrink-0" />
      <span class="truncate">{{ selectedToken.symbol }}</span>
      <BadgeCheck
        v-if="selectedToken.verified"
        class="size-3.5 shrink-0 text-cyan-ray"
        aria-hidden="true"
      />
    </span>
    <span v-else class="text-slate-500">Select</span>
    <ChevronDown class="size-4 shrink-0 text-slate-500" aria-hidden="true" />
  </button>

  <Teleport to="body">
    <section
      v-if="open"
      class="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      @click.self="closeSelector"
    >
      <div
        data-testid="token-selector-modal"
        class="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-white/10 bg-[#1c2440] shadow-2xl"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
      >
        <header
          class="flex items-center justify-between gap-4 px-5 pb-4 pt-5 sm:px-7 sm:pt-7"
        >
          <h2 :id="titleId" class="text-2xl font-black text-slate-100">
            {{ modalTitle }}
          </h2>
          <button
            type="button"
            class="grid size-9 shrink-0 place-items-center rounded-md text-cyan-100 transition hover:bg-white/10"
            title="Close"
            @click="closeSelector"
          >
            <X class="size-6" aria-hidden="true" />
          </button>
        </header>

        <div class="grid gap-4 px-5 pb-5 sm:px-7">
          <div
            class="flex h-14 items-center gap-3 rounded-lg bg-night/80 px-4 ring-1 ring-white/5 focus-within:ring-cyan-ray/50"
          >
            <input
              v-model="query"
              data-testid="token-selector-search"
              class="min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-100 outline-none placeholder:text-slate-500"
              placeholder="Search by token or paste address"
              @keydown.enter.prevent="handleEnter"
            />
            <Search class="size-6 shrink-0 text-cyan-100" aria-hidden="true" />
          </div>

          <section v-if="showPopular" class="grid gap-3">
            <h3 class="text-sm font-black text-slate-400">Popular tokens</h3>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="token in popularTokens"
                :key="token.mint"
                type="button"
                class="flex h-10 items-center gap-2 rounded-lg bg-night/70 px-3 text-sm font-black text-cyan-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
                :disabled="isDisabled(token)"
                @click="selectToken(token)"
              >
                <TokenAvatar :token="token" class="size-5" />
                {{ token.symbol }}
              </button>
            </div>
          </section>
        </div>

        <div class="mx-5 border-t border-white/10 sm:mx-7" />

        <div
          class="grid grid-cols-[minmax(0,1fr)_minmax(128px,0.45fr)] gap-3 px-5 py-4 text-sm font-black text-slate-400 sm:px-7"
        >
          <span>Token</span>
          <span class="text-right">Balance/Address</span>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-4 sm:px-7">
          <div class="grid gap-1">
            <button
              v-for="token in displayedTokens"
              :key="token.mint"
              type="button"
              class="grid min-h-[72px] grid-cols-[minmax(0,1fr)_minmax(128px,0.45fr)] items-center gap-3 rounded-lg px-0 py-2 text-left transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-45 sm:px-2"
              :class="token.mint === modelValue ? 'bg-cyan-ray/10' : ''"
              :disabled="isDisabled(token)"
              @click="selectToken(token)"
            >
              <span class="flex min-w-0 items-center gap-3">
                <TokenAvatar :token="token" class="size-10 shrink-0" />
                <span class="min-w-0">
                  <span class="flex min-w-0 items-center gap-2">
                    <span class="truncate text-lg font-black text-cyan-100">
                      {{ token.symbol }}
                    </span>
                    <BadgeCheck
                      v-if="token.verified"
                      class="size-4 shrink-0 text-cyan-ray"
                      aria-hidden="true"
                    />
                  </span>
                  <span
                    class="mt-1 block truncate text-sm font-semibold text-slate-500"
                  >
                    {{ token.name }}
                  </span>
                </span>
              </span>
              <span class="grid min-w-0 justify-items-end gap-1">
                <span class="text-lg font-black text-cyan-100">
                  {{ balances[token.mint] ?? "--" }}
                </span>
                <span
                  class="flex min-w-0 items-center justify-end gap-2 text-sm font-bold text-slate-500"
                >
                  <span class="truncate">{{
                    shortAddress(token.mint, 6)
                  }}</span>
                  <button
                    type="button"
                    class="grid size-6 place-items-center rounded-md transition hover:bg-white/10 hover:text-cyan-100"
                    title="Copy address"
                    @click.stop="copyMint(token.mint)"
                  >
                    <Check
                      v-if="copiedMint === token.mint"
                      class="size-4"
                      aria-hidden="true"
                    />
                    <Copy v-else class="size-4" aria-hidden="true" />
                  </button>
                  <a
                    class="grid size-6 place-items-center rounded-md transition hover:bg-white/10 hover:text-cyan-100"
                    title="Open in explorer"
                    :href="explorerUrl(config, token.mint)"
                    target="_blank"
                    rel="noreferrer"
                    @click.stop
                  >
                    <ExternalLink class="size-4" aria-hidden="true" />
                  </a>
                </span>
              </span>
            </button>

            <button
              v-if="showCustomMintAction"
              type="button"
              class="mt-1 flex min-h-[64px] items-center justify-between gap-3 rounded-lg border border-dashed border-cyan-ray/30 bg-cyan-ray/10 px-4 py-3 text-left text-sm font-bold text-cyan-100 transition hover:bg-cyan-ray/15"
              :disabled="pendingMint === normalizedQuery"
              @click="requestCustomMint"
            >
              <span class="min-w-0">
                <span class="block font-black">Add custom token</span>
                <span class="mt-1 block truncate text-slate-400">
                  {{ shortAddress(normalizedQuery, 6) }}
                </span>
              </span>
              <Loader2
                v-if="pendingMint === normalizedQuery"
                class="size-5 animate-spin"
                aria-hidden="true"
              />
              <Plus v-else class="size-5" aria-hidden="true" />
            </button>

            <div
              v-if="!displayedTokens.length && !showCustomMintAction"
              class="rounded-lg bg-white/5 px-4 py-5 text-sm font-semibold text-slate-500"
            >
              No tokens found.
            </div>
          </div>
        </div>

        <footer class="grid gap-3 bg-[#273153] px-5 py-4 sm:px-7">
          <p class="text-sm font-semibold leading-6 text-slate-400">
            Custom pasted tokens stay local to this browser session. Official
            listing and verification fees are coming in a later registry flow.
          </p>
          <button
            type="button"
            data-testid="token-selector-list-toggle"
            class="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-night/90 text-base font-black text-cyan-100 transition hover:bg-night"
            @click="toggleListMode"
          >
            <List class="size-5" aria-hidden="true" />
            {{ listMode ? "Back to Selector" : "View Token List" }}
          </button>
        </footer>
      </div>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import {
  BadgeCheck,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  List,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-vue-next";
import { computed, defineComponent, h, ref, watch, type PropType } from "vue";
import { explorerUrl, shortAddress, type ClusterConfig } from "../lib/config";
import { tokenMatchesQuery, type TokenOption } from "../lib/token-registry";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    tokens: TokenOption[];
    balances?: Record<string, string>;
    disabledMints?: string[];
    config: ClusterConfig;
    title?: string;
    pendingMint?: string;
  }>(),
  {
    balances: () => ({}),
    disabledMints: () => [],
    title: "Select a token",
    pendingMint: "",
  },
);

const emit = defineEmits<{
  "update:modelValue": [mint: string];
  "request-custom-mint": [mint: string];
  "visible-mints": [mints: string[]];
}>();

const open = ref(false);
const query = ref("");
const listMode = ref(false);
const copiedMint = ref("");
const titleId = `token-selector-${Math.random().toString(36).slice(2)}`;

const selectedToken = computed(
  () => props.tokens.find((token) => token.mint === props.modelValue) ?? null,
);
const normalizedQuery = computed(() => query.value.trim());
const disabledMintSet = computed(
  () => new Set(props.disabledMints.filter(Boolean)),
);
const modalTitle = computed(() =>
  listMode.value ? "MIM Token List" : props.title,
);
const popularTokens = computed(() =>
  props.tokens.filter((token) => token.popular).slice(0, 6),
);
const showPopular = computed(
  () =>
    !listMode.value && !normalizedQuery.value && popularTokens.value.length > 0,
);
const displayedTokens = computed(() => {
  const source = listMode.value
    ? props.tokens.filter((token) => token.source === "registry")
    : props.tokens;
  return source.filter((token) => tokenMatchesQuery(token, query.value));
});
const exactQueryToken = computed(() =>
  props.tokens.find(
    (token) =>
      token.mint === normalizedQuery.value ||
      token.symbol.toLowerCase() === normalizedQuery.value.toLowerCase(),
  ),
);
const showCustomMintAction = computed(
  () =>
    !listMode.value &&
    isPlausibleMint(normalizedQuery.value) &&
    !props.tokens.some((token) => token.mint === normalizedQuery.value),
);

watch(
  () => [
    open.value,
    displayedTokens.value.map((token) => token.mint).join("|"),
  ],
  () => {
    if (!open.value) return;
    emit(
      "visible-mints",
      displayedTokens.value.slice(0, 12).map((token) => token.mint),
    );
  },
  { immediate: true },
);

watch(
  () => props.modelValue,
  (next, previous) => {
    if (
      open.value &&
      next &&
      next !== previous &&
      props.tokens.some((token) => token.mint === next)
    ) {
      closeSelector();
    }
  },
);

function openSelector() {
  open.value = true;
  listMode.value = false;
  query.value = "";
}

function closeSelector() {
  open.value = false;
}

function selectToken(token: TokenOption) {
  if (isDisabled(token)) return;
  emit("update:modelValue", token.mint);
  closeSelector();
}

function isDisabled(token: TokenOption) {
  return (
    disabledMintSet.value.has(token.mint) && token.mint !== props.modelValue
  );
}

function toggleListMode() {
  listMode.value = !listMode.value;
  query.value = "";
}

function handleEnter() {
  if (showCustomMintAction.value) {
    requestCustomMint();
    return;
  }
  if (exactQueryToken.value && !isDisabled(exactQueryToken.value)) {
    selectToken(exactQueryToken.value);
    return;
  }
  const [firstToken] = displayedTokens.value;
  if (firstToken && !isDisabled(firstToken)) {
    selectToken(firstToken);
  }
}

function requestCustomMint() {
  if (!showCustomMintAction.value) return;
  emit("request-custom-mint", normalizedQuery.value);
}

async function copyMint(mint: string) {
  try {
    await navigator.clipboard.writeText(mint);
    copiedMint.value = mint;
    window.setTimeout(() => {
      if (copiedMint.value === mint) copiedMint.value = "";
    }, 1200);
  } catch {
    copiedMint.value = "";
  }
}

function isPlausibleMint(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function tokenAvatarStyle(token: TokenOption) {
  const palettes = [
    ["#19f7ff", "#2563eb"],
    ["#14f195", "#0d9488"],
    ["#fcee09", "#c2410c"],
    ["#ff3dcb", "#9b5cff"],
    ["#93c5fd", "#4338ca"],
  ];
  const sum = [...token.mint].reduce(
    (total, char) => total + char.charCodeAt(0),
    0,
  );
  const [start, end] = palettes[sum % palettes.length];
  return {
    background: `linear-gradient(135deg, ${start}, ${end})`,
  };
}

const TokenAvatar = defineComponent({
  props: {
    token: { type: Object as PropType<TokenOption>, required: true },
  },
  setup(avatarProps, { attrs }) {
    return () =>
      avatarProps.token.logoURI
        ? h("img", {
            ...attrs,
            src: avatarProps.token.logoURI,
            alt: "",
            class: ["rounded-full object-cover", attrs.class],
          })
        : h(
            "span",
            {
              ...attrs,
              class: [
                "grid place-items-center rounded-full text-[0.7rem] font-black text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]",
                attrs.class,
              ],
              style: tokenAvatarStyle(avatarProps.token),
            },
            avatarProps.token.symbol.slice(0, 2).toUpperCase(),
          );
  },
});
</script>
