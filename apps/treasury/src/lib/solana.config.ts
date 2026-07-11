export type ClusterName = "devnet" | "mainnet";

export type PublicAddress = string;

export type TreasuryAddresses = {
  admin: PublicAddress;
  manaTreasuryProgram: PublicAddress;
  treasuryState: PublicAddress;
  treasuryAuthority: PublicAddress;
  reserveMint: PublicAddress;
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
  tokenPrograms: {
    splToken: PublicAddress;
    associatedToken: PublicAddress;
    tokenMetadata: PublicAddress;
    systemProgram: PublicAddress;
  };
  treasury: TreasuryAddresses | null;
};

export type DeployedClusterConfig = BaseClusterConfig & {
  deployed: true;
  treasury: TreasuryAddresses;
};

export type UndeployedClusterConfig = BaseClusterConfig & {
  deployed: false;
  treasury: null;
};

export type ClusterConfig = DeployedClusterConfig | UndeployedClusterConfig;

export const CLUSTERS: ClusterName[] = ["devnet", "mainnet"];

export const DEFAULT_CLUSTER: ClusterName = "devnet";

export const TOKEN_PROGRAMS = {
  splToken: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  associatedToken: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  tokenMetadata: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  systemProgram: "11111111111111111111111111111111",
} as const;

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
    tokenPrograms: TOKEN_PROGRAMS,
    treasury: {
      admin: "G5mgpU51BzRyG5u294aVnecaxhW121iig4Eg3wXPAVda",
      manaTreasuryProgram: "57zApTfybZ5tGo5iCE8v9Jxe2vBGjfAdowaKUk7j6m5e",
      treasuryState: "9kC54MZdTkSXb6jwUiZji3uts5Ziht7FeQwasuL2i4TT",
      treasuryAuthority: "B1kwwavicxK5aS4Ug4VeyuBG4RHuGQWEKpx1WAYyGduw",
      reserveMint: "FBzs4xf4WrtbhUudP6r1pJy9mSxHD6dbqPwKnD5GsZHy",
      reserveMetadata: "8nYA5NcB7nYrRXWy91V8tPbviNLcfdjidUnWz8p5WYmS",
      reserveAdminAta: "8DBsMr13ZiDqCXKMistXHvD5fwYHqkJa39WY7VzqBKQk",
      manaMint: "BCrgRHs1nrhvnLHxCyZg4cWfrnFTuJ4j2AEoUgjEbdCZ",
      manaMetadata: "PuC126LDvq7TNNBvcogGgm8esnpwNK4eMwMqXn5zSqX",
      activeReserveVault: "EEyt3iE2pp9nmrStA1CStKiHZ8TZx6QxzNbAFYNZYAXi",
      pendingReserveVault: "3K6Le2nsLaCJCSmfJhcjNuqqBLi85TU9rfKhYbQ5ZsdV",
      pendingManaVault: "5mTaLYodMLA8vkK5UkuuzYpRub2Uwpo7nv8gBHFjzFTU",
      cooldownSeconds: 30,
    },
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
    tokenPrograms: TOKEN_PROGRAMS,
    treasury: null,
  },
} as const satisfies Record<ClusterName, ClusterConfig>;

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
  return config.deployed && config.treasury !== null;
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
