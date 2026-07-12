import { describe, expect, it } from "vitest";
import { TOKEN_PROGRAMS, type ClusterName } from "./config";
import {
  buildTokenOptions,
  popularTokenOptions,
  tokenMatchesQuery,
  type TokenRegistryEntry,
} from "./token-registry";

const cluster: ClusterName = "devnet";

describe("token registry helpers", () => {
  it("prefers registry entries over config, pool, and custom duplicates", () => {
    const options = buildTokenOptions({
      cluster,
      registryEntries: [
        registryToken({
          mint: "SameMint1111111111111111111111111111111111",
          symbol: "REG",
          popular: true,
          verified: true,
        }),
      ],
      knownTokens: [
        token({
          mint: "SameMint1111111111111111111111111111111111",
          symbol: "CFG",
        }),
      ],
      pools: [
        {
          sides: [
            token({
              mint: "SameMint1111111111111111111111111111111111",
              symbol: "POOL",
            }),
          ],
        },
      ],
      customTokens: [
        token({
          mint: "SameMint1111111111111111111111111111111111",
          symbol: "CSTM",
        }),
      ],
    });

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      mint: "SameMint1111111111111111111111111111111111",
      symbol: "REG",
      source: "registry",
      popular: true,
      verified: true,
    });
  });

  it("merges unique tokens and keeps custom tokens cluster local", () => {
    const options = buildTokenOptions({
      cluster,
      registryEntries: [registryToken({ mint: "RegistryMint", symbol: "REG" })],
      knownTokens: [token({ mint: "ConfigMint", symbol: "CFG" })],
      pools: [{ sides: [token({ mint: "PoolMint", symbol: "POOL" })] }],
      customTokens: [
        token({ mint: "CustomMint", symbol: "CSTM", cluster }),
        token({ mint: "MainnetOnly", symbol: "MAIN", cluster: "mainnet" }),
      ],
    });

    expect(options.map((entry) => entry.mint).sort()).toEqual([
      "ConfigMint",
      "CustomMint",
      "PoolMint",
      "RegistryMint",
    ]);
    expect(options.find((entry) => entry.mint === "CustomMint")?.source).toBe(
      "custom",
    );
  });

  it("filters popular tokens", () => {
    const options = buildTokenOptions({
      cluster,
      registryEntries: [
        registryToken({ mint: "PopularMint", symbol: "POP", popular: true }),
        registryToken({ mint: "QuietMint", symbol: "QUIET", popular: false }),
      ],
    });

    expect(popularTokenOptions(options).map((entry) => entry.symbol)).toEqual([
      "POP",
    ]);
  });

  it("searches by symbol, name, and mint", () => {
    const [option] = buildTokenOptions({
      cluster,
      registryEntries: [
        registryToken({
          mint: "SearchMint11111111111111111111111111111111",
          symbol: "FIND",
          name: "Findable Coin",
        }),
      ],
    });

    expect(tokenMatchesQuery(option, "find")).toBe(true);
    expect(tokenMatchesQuery(option, "coin")).toBe(true);
    expect(tokenMatchesQuery(option, "SearchMint")).toBe(true);
    expect(tokenMatchesQuery(option, "missing")).toBe(false);
  });
});

function registryToken(
  overrides: Partial<TokenRegistryEntry>,
): TokenRegistryEntry {
  return {
    cluster,
    mint: "Mint111111111111111111111111111111111111",
    symbol: "MINT",
    name: "Mint Token",
    decimals: 6,
    tokenProgram: TOKEN_PROGRAMS.splToken,
    popular: false,
    listed: true,
    verified: false,
    ...overrides,
  };
}

function token(overrides: Partial<TokenRegistryEntry>): TokenRegistryEntry {
  return {
    cluster,
    mint: "Mint222222222222222222222222222222222222",
    symbol: "TOK",
    name: `${overrides.symbol ?? "TOK"} Token`,
    decimals: 6,
    tokenProgram: TOKEN_PROGRAMS.splToken,
    popular: false,
    listed: true,
    verified: false,
    ...overrides,
  };
}
