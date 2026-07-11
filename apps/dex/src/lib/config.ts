export type ClusterName = "devnet" | "mainnet";

export type PublicAddress = string;

export type DexTokenConfig = {
  mint: PublicAddress;
  symbol: string;
  name: string;
  decimals: number;
  tokenProgram: PublicAddress;
};

export type DexTreasuryConfig = {
  manaTreasuryProgram: PublicAddress;
  treasuryState: PublicAddress;
  treasuryAuthority: PublicAddress;
  reserveMint: PublicAddress;
  activeReserveVault: PublicAddress;
};

export type BaseDexClusterConfig = {
  cluster: ClusterName;
  label: string;
  rpcUrl: string;
  wsUrl: string;
  explorerCluster: "devnet" | "mainnet-beta";
  deployed: boolean;
  defaultSlippageBps: number;
  cpSwapProgram: PublicAddress | null;
  ammConfig: PublicAddress | null;
  createPoolFeeReceiver: PublicAddress | null;
  treasury: DexTreasuryConfig | null;
  tokenPrograms: {
    splToken: PublicAddress;
    token2022: PublicAddress;
    associatedToken: PublicAddress;
    systemProgram: PublicAddress;
  };
  knownTokens: DexTokenConfig[];
};

export type DeployedDexClusterConfig = BaseDexClusterConfig & {
  deployed: true;
  cpSwapProgram: PublicAddress;
  ammConfig: PublicAddress;
  createPoolFeeReceiver: PublicAddress;
  treasury: DexTreasuryConfig;
};

export type DisabledDexClusterConfig = BaseDexClusterConfig & {
  deployed: false;
  cpSwapProgram: null;
  ammConfig: null;
  createPoolFeeReceiver: null;
  treasury: null;
};

export type DexClusterConfig =
  DeployedDexClusterConfig | DisabledDexClusterConfig;

export const TOKEN_PROGRAMS = {
  splToken: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  token2022: "TokenzQdBNbLqP5VEhdkAS6EPFvPYe9HhQ9HsgVxqQ",
  associatedToken: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  systemProgram: "11111111111111111111111111111111",
} as const;

export const DEVNET_SMOKE_POOL = "2DvuwYkXAqZSGVni6MFrVJuVB7fSZDaDrzH5iUpmVEAm";

export const SOLANA_CONFIG = {
  devnet: {
    cluster: "devnet",
    label: "Devnet",
    rpcUrl: "https://api.devnet.solana.com",
    wsUrl: "wss://api.devnet.solana.com/",
    explorerCluster: "devnet",
    deployed: true,
    defaultSlippageBps: 100,
    cpSwapProgram: "HBcK8eBUSWW3YGgrWv1aUpsMF6GtgkjwkcoBiHMw8gxY",
    ammConfig: "HDc67djuMJJ8RRPcZU7jnqzAHzDV1PnLBhyPDDsdq3Wc",
    createPoolFeeReceiver: "9xBAJLDnp9PyGUtr1RNzJbQhYt3CXSD6FvCxYFa9VZWG",
    treasury: {
      manaTreasuryProgram: "57zApTfybZ5tGo5iCE8v9Jxe2vBGjfAdowaKUk7j6m5e",
      treasuryState: "9kC54MZdTkSXb6jwUiZji3uts5Ziht7FeQwasuL2i4TT",
      treasuryAuthority: "B1kwwavicxK5aS4Ug4VeyuBG4RHuGQWEKpx1WAYyGduw",
      reserveMint: "FBzs4xf4WrtbhUudP6r1pJy9mSxHD6dbqPwKnD5GsZHy",
      activeReserveVault: "EEyt3iE2pp9nmrStA1CStKiHZ8TZx6QxzNbAFYNZYAXi",
    },
    tokenPrograms: TOKEN_PROGRAMS,
    knownTokens: [
      {
        mint: "FBzs4xf4WrtbhUudP6r1pJy9mSxHD6dbqPwKnD5GsZHy",
        symbol: "DMIM",
        name: "Dev MIM",
        decimals: 6,
        tokenProgram: TOKEN_PROGRAMS.splToken,
      },
      {
        mint: "BCrgRHs1nrhvnLHxCyZg4cWfrnFTuJ4j2AEoUgjEbdCZ",
        symbol: "MANA",
        name: "Mana",
        decimals: 6,
        tokenProgram: TOKEN_PROGRAMS.splToken,
      },
    ],
  },
  mainnet: {
    cluster: "mainnet",
    label: "Mainnet",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    wsUrl: "wss://api.mainnet-beta.solana.com",
    explorerCluster: "mainnet-beta",
    deployed: false,
    defaultSlippageBps: 100,
    cpSwapProgram: null,
    ammConfig: null,
    createPoolFeeReceiver: null,
    treasury: null,
    tokenPrograms: TOKEN_PROGRAMS,
    knownTokens: [],
  },
} as const satisfies Record<ClusterName, DexClusterConfig>;

export const CLUSTERS: ClusterName[] = ["devnet", "mainnet"];
export const DEFAULT_CLUSTER: ClusterName = "devnet";

export function parseClusterParam(
  value: string | null | undefined,
): ClusterName {
  return value === "mainnet" || value === "devnet" ? value : DEFAULT_CLUSTER;
}

export function getClusterConfig(cluster: ClusterName): DexClusterConfig {
  return SOLANA_CONFIG[cluster];
}

export function isDeployedConfig(
  config: DexClusterConfig,
): config is DeployedDexClusterConfig {
  return config.deployed && config.cpSwapProgram !== null;
}

export function knownTokenForMint(
  config: DexClusterConfig,
  mint: string,
): DexTokenConfig | null {
  return (
    config.knownTokens.find((token) => token.mint === mint) ??
    (config.treasury?.reserveMint === mint
      ? (config.knownTokens.find((token) => token.symbol === "DMIM") ?? null)
      : null)
  );
}

export function shortAddress(address: string, edge = 4): string {
  return `${address.slice(0, edge)}...${address.slice(-edge)}`;
}

export function explorerUrl(
  config: DexClusterConfig,
  address: string,
  type: "address" | "tx" = "address",
): string {
  const path = type === "tx" ? "tx" : "address";
  const cluster =
    config.explorerCluster === "mainnet-beta"
      ? ""
      : `?cluster=${config.explorerCluster}`;
  return `https://explorer.solana.com/${path}/${address}${cluster}`;
}
