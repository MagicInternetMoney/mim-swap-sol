<template>
  <main class="mim-shell relative isolate overflow-x-hidden">
    <ParticleField />

    <header class="mim-topbar">
      <div
        class="mx-auto flex h-20 w-full max-w-[1720px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
      >
        <button
          type="button"
          class="mim-logo hover:bg-white/5"
          title="Home"
          @click="navigate('/')"
        >
          <Hexagon class="size-9 text-cyan-ray" aria-hidden="true" />
          <span class="sr-only">MIM Swap</span>
        </button>

        <nav
          class="hidden min-w-0 flex-1 items-center gap-7 pl-4 text-base font-black text-slate-500 md:flex"
        >
          <button
            v-for="item in navItems"
            :key="item.path"
            type="button"
            class="mim-nav-link"
            :class="isActive(item.path) ? 'mim-nav-link-active' : ''"
            @click="navigate(item.path)"
          >
            {{ item.label }}
          </button>
        </nav>

        <div class="flex items-center gap-3">
          <button
            type="button"
            class="hidden size-10 place-items-center rounded-lg text-slate-300 transition hover:bg-white/5 sm:grid"
            title="Treasury"
            @click="navigate('/treasury')"
          >
            <Zap class="size-5" aria-hidden="true" />
          </button>
          <div
            class="hidden grid-cols-2 rounded-lg border border-white/10 bg-white/5 p-1 lg:grid"
          >
            <button
              v-for="option in clusterOptions"
              :key="option"
              type="button"
              class="rounded-md px-3 py-2 text-sm font-black transition"
              :class="
                cluster === option
                  ? 'bg-cyan-ray text-slate-950'
                  : 'text-slate-400 hover:bg-white/10'
              "
              @click="selectCluster(option)"
            >
              {{ getClusterConfig(option).label }}
            </button>
          </div>
          <button
            type="button"
            class="hidden size-10 place-items-center rounded-lg text-slate-300 transition hover:bg-white/5 sm:grid"
            title="Admin"
            @click="navigate('/treasury/admin')"
          >
            <Settings class="size-5" aria-hidden="true" />
          </button>
          <WalletMultiButton />
        </div>
      </div>

      <nav
        class="mx-auto grid w-full max-w-[1720px] grid-cols-4 gap-1 px-4 pb-3 text-sm font-black text-slate-500 md:hidden"
      >
        <button
          v-for="item in mobileNavItems"
          :key="item.path"
          type="button"
          class="h-10 rounded-md transition hover:bg-white/5 hover:text-slate-200"
          :class="isActive(item.path) ? 'bg-white/5 text-cyan-ray' : ''"
          @click="navigate(item.path)"
        >
          {{ item.label }}
        </button>
      </nav>
    </header>

    <section
      v-if="walletErrorMessage"
      class="relative z-10 mx-auto mt-4 w-full max-w-[1680px] px-4 sm:px-6 lg:px-8"
    >
      <div
        class="rounded-lg border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100"
      >
        {{ walletErrorMessage }}
      </div>
    </section>

    <section class="relative z-10 mx-auto w-full max-w-[1680px] px-4 py-8 sm:px-6 lg:px-8">
      <HomeView v-if="routeKind === 'home'" />

      <section
        v-else-if="routeKind === 'swap'"
        class="mx-auto grid w-full max-w-xl gap-5"
      >
        <DexShell
          embedded
          compact
          :wallet-error-message="walletErrorMessage"
          :cluster-name="cluster"
          forced-tab="swap"
        />
      </section>

      <section v-else-if="routeKind === 'liquidity'" class="grid gap-4">
        <PageTitle
          title="Liquidity Pools"
          subtitle="Provide liquidity, earn yield."
          action-label="Create"
          @action="navigate('/liquidity/create')"
        />
        <PoolToolbar />
        <DexShell
          embedded
          compact
          :wallet-error-message="walletErrorMessage"
          :cluster-name="cluster"
          forced-tab="pools"
        />
      </section>

      <section v-else-if="routeKind === 'createPool'" class="grid gap-5">
        <button
          type="button"
          class="inline-flex w-fit items-center gap-2 text-base font-black text-slate-500 transition hover:text-slate-200"
          @click="navigate('/liquidity')"
        >
          <ChevronLeft class="size-5" aria-hidden="true" />
          Back
        </button>
        <div
          class="grid gap-8 xl:grid-cols-[minmax(280px,0.75fr)_minmax(420px,1fr)] xl:items-start"
        >
          <NotePanel />
          <div>
            <h1 class="mb-5 text-xl font-black text-slate-300">
              Initialize CPMM pool
            </h1>
            <DexShell
              embedded
              compact
              liquidity-panel="create"
              :wallet-error-message="walletErrorMessage"
              :cluster-name="cluster"
              forced-tab="liquidity"
            />
          </div>
        </div>
      </section>

      <section v-else-if="routeKind === 'pool'" class="grid gap-5">
        <button
          type="button"
          class="inline-flex w-fit items-center gap-2 text-base font-black text-slate-500 transition hover:text-slate-200"
          @click="navigate('/liquidity')"
        >
          <ChevronLeft class="size-5" aria-hidden="true" />
          Back
        </button>
        <section
          class="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)] xl:items-start"
        >
          <MarketChart title="Selected Pool" />
          <DexShell
            embedded
            compact
            :wallet-error-message="walletErrorMessage"
            :cluster-name="cluster"
            forced-tab="swap"
          />
        </section>
        <DexShell
          embedded
          compact
          liquidity-panel="manage"
          :wallet-error-message="walletErrorMessage"
          :cluster-name="cluster"
          forced-tab="liquidity"
        />
      </section>

      <DexShell
        v-else-if="routeKind === 'portfolio'"
        embedded
        compact
        :wallet-error-message="walletErrorMessage"
        :cluster-name="cluster"
        forced-tab="portfolio"
      />

      <section v-else-if="routeKind === 'treasury'" class="grid gap-4">
        <TreasuryNav />
        <TreasuryShell
          embedded
          :wallet-error-message="walletErrorMessage"
          :cluster-name="cluster"
          mode="treasury"
        />
      </section>

      <section v-else-if="routeKind === 'treasuryAbout'" class="grid gap-4">
        <TreasuryNav />
        <TreasuryShell
          embedded
          :wallet-error-message="walletErrorMessage"
          :cluster-name="cluster"
          mode="about"
        />
      </section>

      <section v-else class="grid gap-4">
        <TreasuryNav />
        <TreasuryShell
          embedded
          :wallet-error-message="walletErrorMessage"
          :cluster-name="cluster"
          mode="feeOps"
        />
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { WalletMultiButton } from "@solana/wallet-adapter-vue-ui";
import {
  ChevronLeft,
  Hexagon,
  Info,
  Landmark,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from "lucide-vue-next";
import {
  computed,
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  ref,
} from "vue";
import {
  CLUSTERS,
  DEFAULT_CLUSTER,
  getClusterConfig,
  parseClusterParam,
  type ClusterName,
} from "../lib/config";
import DexShell from "./DexShell.vue";
import ParticleField from "./ParticleField.vue";
import TreasuryShell from "../treasury/components/TreasuryShell.vue";

type RouteKind =
  | "home"
  | "swap"
  | "liquidity"
  | "createPool"
  | "pool"
  | "portfolio"
  | "treasury"
  | "treasuryAbout"
  | "treasuryAdmin";

const props = defineProps<{
  walletErrorMessage?: string;
}>();

const clusterOptions = CLUSTERS;
const cluster = ref<ClusterName>(initialCluster());
const currentPath = ref(currentBrowserPath());

const navItems = [
  { path: "/swap", label: "Swap" },
  { path: "/liquidity", label: "Liquidity" },
  { path: "/treasury", label: "Treasury" },
];
const mobileNavItems = [
  { path: "/swap", label: "Swap" },
  { path: "/liquidity", label: "Pools" },
  { path: "/liquidity/create", label: "Create" },
  { path: "/treasury", label: "Treasury" },
];

const routeKind = computed<RouteKind>(() => routeKindFor(currentPath.value));

onMounted(() => {
  window.addEventListener("popstate", handlePopState);
});

onUnmounted(() => {
  window.removeEventListener("popstate", handlePopState);
});

function selectCluster(next: ClusterName) {
  cluster.value = next;
  syncUrlCluster(next);
}

function navigate(path: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.pathname = path;
  url.searchParams.set("cluster", cluster.value);
  window.history.pushState(null, "", url);
  currentPath.value = path;
}

function isActive(path: string) {
  if (path === "/liquidity") {
    return currentPath.value.startsWith("/liquidity") || currentPath.value === "/pool";
  }
  if (path === "/treasury") {
    return currentPath.value.startsWith("/treasury");
  }
  return currentPath.value === path;
}

function handlePopState() {
  currentPath.value = currentBrowserPath();
  cluster.value = initialCluster();
}

function initialCluster(): ClusterName {
  if (typeof window === "undefined") return DEFAULT_CLUSTER;
  return parseClusterParam(
    new URLSearchParams(window.location.search).get("cluster")
  );
}

function syncUrlCluster(next: ClusterName) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("cluster", next);
  window.history.replaceState(null, "", url);
}

function currentBrowserPath() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

function routeKindFor(path: string): RouteKind {
  if (path === "/swap") return "swap";
  if (path === "/liquidity/create") return "createPool";
  if (path === "/liquidity") return "liquidity";
  if (path === "/pool") return "pool";
  if (path === "/portfolio") return "portfolio";
  if (path === "/treasury/about") return "treasuryAbout";
  if (path === "/treasury/admin") return "treasuryAdmin";
  if (path === "/treasury") return "treasury";
  return "home";
}

const HomeView = defineComponent({
  setup() {
    const cards = [
      {
        title: "Swap",
        copy: "Trade through CP-swap pools.",
        path: "/swap",
        accent: "linear-gradient(90deg, #19f7ff, #14f195)",
      },
      {
        title: "Liquidity",
        copy: "Browse pools or create a new LP.",
        path: "/liquidity",
        accent: "linear-gradient(90deg, #9b5cff, #19f7ff)",
      },
      {
        title: "Treasury",
        copy: "Track reserves, MANA, and fee flow.",
        path: "/treasury",
        accent: "linear-gradient(90deg, #14f195, #fcee09, #ff3dcb)",
      },
    ];
    return () =>
      h("section", { class: "grid gap-8 pt-8" }, [
        h("div", { class: "max-w-4xl" }, [
          h(
            "h1",
            {
              class:
                "mim-colorwave-text text-5xl font-black leading-tight sm:text-7xl",
            },
            "MIM Swap"
          ),
          h(
            "p",
            { class: "mt-5 max-w-2xl text-lg font-semibold text-slate-400" },
            "Swap, LP, and treasury flows in one app."
          ),
        ]),
        h(
          "div",
          { class: "grid gap-4 md:grid-cols-3" },
          cards.map((card) =>
            h(
              "button",
              {
                type: "button",
                class:
                  "mim-card mim-colorwave-border group min-h-48 p-5 text-left transition hover:-translate-y-0.5",
                onClick: () => navigate(card.path),
              },
              [
                h("div", {
                  class: "mb-8 h-1.5 w-24 rounded-full",
                  style: `background:${card.accent}`,
                }),
                h("h2", { class: "text-2xl font-black text-slate-100" }, card.title),
                h("p", { class: "mt-3 text-sm font-semibold text-slate-400" }, card.copy),
                h("div", { class: "mt-8 text-sm font-black text-cyan-ray" }, "Open"),
              ]
            )
          )
        ),
      ]);
  },
});

const MarketChart = defineComponent({
  props: {
    title: { type: String, required: true },
  },
  setup(props) {
    const bars = [34, 46, 42, 60, 54, 66, 51, 74, 57, 63, 49, 70, 55, 62, 47, 58, 52, 67, 43, 59, 50, 64, 45, 56];
    return () =>
      h("section", { class: "mim-card p-5" }, [
        h("div", { class: "mb-6 flex items-center justify-between gap-3" }, [
          h("div", { class: "flex items-center gap-3" }, [
            h("div", { class: "grid size-9 place-items-center rounded-full bg-cyan-ray/10 text-cyan-ray" }, [
              h(Sparkles, { class: "size-5", "aria-hidden": "true" }),
            ]),
            h("div", [
              h("h2", { class: "text-xl font-black text-slate-200" }, props.title),
              h("p", { class: "mt-1 text-sm font-bold text-slate-500" }, "15m"),
            ]),
          ]),
          h("div", { class: "flex items-center gap-2 text-sm font-black text-slate-400" }, [
            h("span", { class: "rounded-md bg-white/5 px-3 py-1" }, "Market"),
            h("span", { class: "rounded-md bg-white/5 px-3 py-1" }, "0.5%"),
          ]),
        ]),
        h("div", { class: "relative h-[360px] overflow-hidden rounded-md bg-night/70" }, [
          h("div", { class: "absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:100%_54px,84px_100%]" }),
          h("div", { class: "absolute inset-x-6 bottom-10 flex h-64 items-end gap-2" },
            bars.map((height, index) =>
              h("div", { class: "flex flex-1 items-end justify-center" }, [
                h("div", {
                  class: index % 3 === 0 ? "w-full rounded-t-sm bg-pink-500" : "w-full rounded-t-sm bg-cyan-ray",
                  style: `height:${height}%`,
                }),
              ])
            )
          ),
          h("div", { class: "absolute right-5 top-24 rounded-md bg-cyan-ray px-2 py-1 text-sm font-black text-slate-950" }, "0.008925"),
          h("div", { class: "absolute bottom-4 right-5 text-sm font-bold text-slate-400" }, "auto"),
        ]),
      ]);
  },
});

const PageTitle = defineComponent({
  emits: ["action"],
  props: {
    title: { type: String, required: true },
    subtitle: { type: String, required: true },
    actionLabel: { type: String, required: true },
  },
  setup(props, { emit }) {
    return () =>
      h("div", { class: "flex flex-col gap-4 py-4 lg:flex-row lg:items-end lg:justify-between" }, [
        h("div", [
          h("h1", { class: "mim-colorwave-text text-4xl font-black" }, props.title),
          h("p", { class: "mt-3 text-base font-semibold text-slate-500" }, props.subtitle),
        ]),
        h("button", {
          type: "button",
          class: "mim-button-secondary h-11 min-w-32 border-cyan-ray/70 text-cyan-ray hover:bg-cyan-ray hover:text-slate-950",
          onClick: () => emit("action"),
        }, props.actionLabel),
      ]);
  },
});

const PoolToolbar = defineComponent({
  setup() {
    const chips = ["All", "Standard", "LSTs", "Stables", "RWA", "MANA"];
    return () =>
      h("div", { class: "mim-card grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.45fr)]" }, [
        h("div", { class: "flex flex-wrap gap-2" },
          chips.map((chip, index) =>
            h("button", {
              type: "button",
              class: index === 0
                ? "h-10 rounded-full border border-cyan-ray bg-cyan-ray/10 px-5 text-sm font-black text-cyan-ray"
                : "h-10 rounded-full bg-white/8 px-5 text-sm font-black text-slate-400 hover:bg-white/12",
            }, chip)
          )
        ),
        h("div", { class: "flex gap-2" }, [
          h("div", { class: "flex h-10 min-w-0 flex-1 items-center rounded-full bg-white/8 px-4 text-sm font-bold text-slate-500" }, "Search all"),
          h("button", { type: "button", class: "grid size-10 place-items-center rounded-full bg-white/8 text-slate-300" }, [
            h(SlidersHorizontal, { class: "size-5", "aria-hidden": "true" }),
          ]),
        ]),
      ]);
  },
});

const NotePanel = defineComponent({
  setup() {
    return () =>
      h("section", { class: "mim-card p-6 text-slate-400" }, [
        h("div", { class: "mb-4 flex items-center gap-2 text-cyan-100" }, [
          h(Info, { class: "size-5", "aria-hidden": "true" }),
          h("h2", { class: "font-black" }, "Please Note"),
        ]),
        h("p", { class: "text-sm font-semibold leading-7 text-slate-500" }, "Pool creation initializes an LP mint, vaults, and immutable pool fee settings for the selected token pair."),
      ]);
  },
});

const TreasuryNav = defineComponent({
  setup() {
    const items = [
      { path: "/treasury", label: "Treasury" },
      { path: "/treasury/about", label: "About" },
      { path: "/treasury/admin", label: "Admin" },
    ];
    return () =>
      h("div", { class: "mim-card flex flex-wrap items-center justify-between gap-3 p-2" }, [
        h("div", { class: "flex items-center gap-2 pl-2 text-slate-300" }, [
          h(Landmark, { class: "size-5", "aria-hidden": "true" }),
          h("span", { class: "font-black" }, "Mana Treasury"),
        ]),
        h("div", { class: "flex flex-wrap gap-2" },
          items.map((item) =>
            h("button", {
              type: "button",
              class: isActive(item.path)
                ? "h-10 rounded-md bg-cyan-ray px-4 text-sm font-black text-slate-950"
                : "h-10 rounded-md px-4 text-sm font-black text-slate-400 hover:bg-white/10",
              onClick: () => navigate(item.path),
            }, item.label)
          )
        ),
      ]);
  },
});
</script>
