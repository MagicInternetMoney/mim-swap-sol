export type ClusterName = "devnet" | "mainnet";

export type PublicAddress = string;

export type TokenConfig = {
  mint: PublicAddress;
  symbol: string;
  name: string;
  decimals: number;
  tokenProgram: PublicAddress;
};

export type TreasuryAddresses = {
  admin: PublicAddress;
  manaTreasuryProgram: PublicAddress;
  treasuryState: PublicAddress;
  treasuryAuthority: PublicAddress;
  reserveMint: PublicAddress;
  reserveTokenProgram: PublicAddress;
  reserveMetadata: PublicAddress;
  reserveAdminAta?: PublicAddress;
  manaMint: PublicAddress;
  manaMetadata: PublicAddress;
  activeReserveVault: PublicAddress;
  pendingReserveVault: PublicAddress;
  pendingManaVault: PublicAddress;
  cooldownSeconds: number;
};

export type BaseClusterConfig = {
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
  treasury: TreasuryAddresses | null;
  tokenPrograms: {
    splToken: PublicAddress;
    token2022: PublicAddress;
    associatedToken: PublicAddress;
    tokenMetadata: PublicAddress;
    systemProgram: PublicAddress;
  };
  knownTokens: TokenConfig[];
};

export type DeployedClusterConfig = BaseClusterConfig & {
  deployed: true;
  cpSwapProgram: PublicAddress;
  ammConfig: PublicAddress;
  createPoolFeeReceiver: PublicAddress;
  treasury: TreasuryAddresses;
};

export type UndeployedClusterConfig = BaseClusterConfig & {
  deployed: false;
  cpSwapProgram: null;
  ammConfig: null;
  createPoolFeeReceiver: null;
  treasury: null;
};

export type ClusterConfig = DeployedClusterConfig | UndeployedClusterConfig;

export type DexTokenConfig = TokenConfig;
export type DexTreasuryConfig = TreasuryAddresses;
export type BaseDexClusterConfig = BaseClusterConfig;
export type DeployedDexClusterConfig = DeployedClusterConfig;
export type DisabledDexClusterConfig = UndeployedClusterConfig;
export type DexClusterConfig = ClusterConfig;

export const TOKEN_PROGRAMS = {
  splToken: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  token2022: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  associatedToken: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  tokenMetadata: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
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
      admin: "G5mgpU51BzRyG5u294aVnecaxhW121iig4Eg3wXPAVda",
      manaTreasuryProgram: "57zApTfybZ5tGo5iCE8v9Jxe2vBGjfAdowaKUk7j6m5e",
      treasuryState: "9kC54MZdTkSXb6jwUiZji3uts5Ziht7FeQwasuL2i4TT",
      treasuryAuthority: "B1kwwavicxK5aS4Ug4VeyuBG4RHuGQWEKpx1WAYyGduw",
      reserveMint: "FBzs4xf4WrtbhUudP6r1pJy9mSxHD6dbqPwKnD5GsZHy",
      reserveTokenProgram: TOKEN_PROGRAMS.splToken,
      reserveMetadata: "8nYA5NcB7nYrRXWy91V8tPbviNLcfdjidUnWz8p5WYmS",
      reserveAdminAta: "8DBsMr13ZiDqCXKMistXHvD5fwYHqkJa39WY7VzqBKQk",
      manaMint: "BCrgRHs1nrhvnLHxCyZg4cWfrnFTuJ4j2AEoUgjEbdCZ",
      manaMetadata: "PuC126LDvq7TNNBvcogGgm8esnpwNK4eMwMqXn5zSqX",
      activeReserveVault: "EEyt3iE2pp9nmrStA1CStKiHZ8TZx6QxzNbAFYNZYAXi",
      pendingReserveVault: "3K6Le2nsLaCJCSmfJhcjNuqqBLi85TU9rfKhYbQ5ZsdV",
      pendingManaVault: "5mTaLYodMLA8vkK5UkuuzYpRub2Uwpo7nv8gBHFjzFTU",
      cooldownSeconds: 30,
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
} as const satisfies Record<ClusterName, ClusterConfig>;

export const CLUSTERS: ClusterName[] = ["devnet", "mainnet"];
export const DEFAULT_CLUSTER: ClusterName = "devnet";

export function parseClusterParam(
  value: string | null | undefined
): ClusterName {
  return value === "mainnet" || value === "devnet" ? value : DEFAULT_CLUSTER;
}

export function getClusterConfig(cluster: ClusterName): ClusterConfig {
  return SOLANA_CONFIG[cluster];
}

export function isDeployedConfig(
  config: ClusterConfig
): config is DeployedClusterConfig {
  return (
    config.deployed &&
    config.cpSwapProgram !== null &&
    config.ammConfig !== null &&
    config.createPoolFeeReceiver !== null &&
    config.treasury !== null
  );
}

export function knownTokenForMint(
  config: ClusterConfig,
  mint: string
): TokenConfig | null {
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
  config: ClusterConfig,
  address: string,
  type: "address" | "tx" = "address"
): string {
  const path = type === "tx" ? "tx" : "address";
  const cluster =
    config.explorerCluster === "mainnet-beta"
      ? ""
      : `?cluster=${config.explorerCluster}`;
  return `https://explorer.solana.com/${path}/${address}${cluster}`;
}
