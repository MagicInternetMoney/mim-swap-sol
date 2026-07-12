import registry from "./token-registry.json";
import type { ClusterName, TokenConfig } from "./config";

export type TokenRegistryEntry = TokenConfig & {
  cluster: ClusterName;
  popular: boolean;
  listed: boolean;
  verified: boolean;
  logoURI?: string;
};

export type TokenOptionSource = "registry" | "config" | "pool" | "custom";

export type TokenOption = TokenRegistryEntry & {
  source: TokenOptionSource;
};

export type TokenMergeEntry = TokenConfig &
  Partial<
    Pick<
      TokenRegistryEntry,
      "cluster" | "popular" | "listed" | "verified" | "logoURI"
    >
  >;

export type TokenMergePool = {
  sides: TokenMergeEntry[];
};

export type BuildTokenOptionsInput = {
  cluster: ClusterName;
  knownTokens?: readonly TokenConfig[];
  pools?: readonly TokenMergePool[];
  customTokens?: readonly TokenMergeEntry[];
  registryEntries?: readonly TokenRegistryEntry[];
};

const REGISTRY = registry as TokenRegistryEntry[];

export function officialTokensForCluster(
  cluster: ClusterName,
  registryEntries: readonly TokenRegistryEntry[] = REGISTRY,
): TokenOption[] {
  return registryEntries
    .filter((token) => token.cluster === cluster)
    .map((token) => ({ ...token, source: "registry" as const }));
}

export function buildTokenOptions(
  input: BuildTokenOptionsInput,
): TokenOption[] {
  const byMint = new Map<string, TokenOption>();

  for (const token of officialTokensForCluster(
    input.cluster,
    input.registryEntries,
  )) {
    setIfNew(byMint, token);
  }

  for (const token of input.knownTokens ?? []) {
    setIfNew(byMint, normalizeToken(input.cluster, token, "config"));
  }

  for (const pool of input.pools ?? []) {
    for (const side of pool.sides) {
      setIfNew(byMint, normalizeToken(input.cluster, side, "pool"));
    }
  }

  for (const token of input.customTokens ?? []) {
    if (token.cluster && token.cluster !== input.cluster) continue;
    setIfNew(byMint, normalizeToken(input.cluster, token, "custom"));
  }

  return [...byMint.values()].sort(compareTokenOptions);
}

export function popularTokenOptions(tokens: readonly TokenOption[]) {
  return tokens.filter((token) => token.popular);
}

export function tokenMatchesQuery(token: TokenOption, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [token.symbol, token.name, token.mint]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function setIfNew(byMint: Map<string, TokenOption>, token: TokenOption) {
  if (!byMint.has(token.mint)) {
    byMint.set(token.mint, token);
  }
}

function normalizeToken(
  cluster: ClusterName,
  token: TokenMergeEntry,
  source: TokenOptionSource,
): TokenOption {
  return {
    cluster: token.cluster ?? cluster,
    mint: token.mint,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    tokenProgram: token.tokenProgram,
    popular: token.popular ?? false,
    listed: token.listed ?? source !== "custom",
    verified: token.verified ?? false,
    logoURI: token.logoURI,
    source,
  };
}

function compareTokenOptions(a: TokenOption, b: TokenOption) {
  return (
    Number(b.verified) - Number(a.verified) ||
    Number(b.listed) - Number(a.listed) ||
    Number(b.popular) - Number(a.popular) ||
    sourceRank(a.source) - sourceRank(b.source) ||
    a.symbol.localeCompare(b.symbol)
  );
}

function sourceRank(source: TokenOptionSource) {
  if (source === "registry") return 0;
  if (source === "config") return 1;
  if (source === "pool") return 2;
  return 3;
}
