import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  type AccountMeta,
  type Commitment,
  type SimulatedTransactionResponse,
} from "@solana/web3.js";
import manaTreasuryIdl from "../../idl/mana_treasury.json";
import type { ManaTreasury } from "../../idl/mana_treasury";
import cpSwapIdl from "../../idl/raydium_cp_swap.json";
import type { RaydiumCpSwap } from "../../idl/raydium_cp_swap";
import { calculateDepositManaOut, calculateRedeemReserveOut } from "./amounts";
import {
  type DeployedClusterConfig,
  isDeployedConfig,
  type ClusterConfig,
} from "./solana.config";
import {
  deriveAssetVaultPdas,
  deriveCpSwapAuthority,
  deriveRedemptionRequest,
} from "./pdas";

const COMMITMENT: Commitment = "confirmed";

type AnchorWalletLike = {
  publicKey: PublicKey;
  signTransaction(transaction: Transaction): Promise<Transaction>;
  signAllTransactions(transactions: Transaction[]): Promise<Transaction[]>;
};

const READONLY_WALLET: AnchorWalletLike = {
  publicKey: SystemProgram.programId,
  signTransaction: async () => {
    throw new Error("Readonly provider cannot sign transactions.");
  },
  signAllTransactions: async () => {
    throw new Error("Readonly provider cannot sign transactions.");
  },
};

export type MintSnapshot = {
  address: string;
  decimals: number;
  supply: bigint;
};

export type TokenAccountSnapshot = {
  address: string;
  amount: bigint;
};

export type RedemptionSnapshot = {
  address: string;
  manaAmount: bigint;
  reservedReserveAmount: bigint;
  unlockTimestamp: number;
  finalized: boolean;
};

export type TreasurySnapshot = {
  treasuryState: {
    authority: string;
    pendingAuthority: string;
    reserveMint: string;
    manaMint: string;
    activeReserveVault: string;
    pendingReserveVault: string;
    pendingManaVault: string;
    cooldownSeconds: number;
    swapRouter: string;
    pendingManaSupply: bigint;
  };
  reserveMint: MintSnapshot;
  manaMint: MintSnapshot;
  activeReserveVault: TokenAccountSnapshot;
  pendingReserveVault: TokenAccountSnapshot;
  pendingManaVault: TokenAccountSnapshot;
  activeManaSupply: bigint;
  user?: {
    reserveAta: string;
    reserveAtaExists: boolean;
    reserveBalance: bigint;
    manaAta: string;
    manaAtaExists: boolean;
    manaBalance: bigint;
    redemptionRequest: RedemptionSnapshot | null;
  };
  validationErrors: string[];
};

export type TreasuryPreview = {
  rawAmount: bigint;
  estimatedOut: bigint;
  minOut: bigint;
};

export type AssetVaultSnapshot = {
  assetVault: string;
  assetTokenAccount: string;
  assetVaultExists: boolean;
  assetTokenAccountExists: boolean;
  amount: bigint | null;
};

export type CpSwapPoolSideSnapshot = {
  index: 0 | 1;
  mint: string;
  vault: string;
  tokenProgram: string;
  decimals: number;
  protocolFees: bigint;
  fundFees: bigint;
  feeReceiver: string;
  isReserveMint: boolean;
  assetVault: AssetVaultSnapshot | null;
};

export type CpSwapPoolSnapshot = {
  address: string;
  ammConfig: string;
  observationKey: string;
  sides: [CpSwapPoolSideSnapshot, CpSwapPoolSideSnapshot];
  canSweepProtocolFees: boolean;
  canSweepFundFees: boolean;
  missingAssetVaults: CpSwapPoolSideSnapshot[];
};

export type PreparedSimulation = {
  transaction: Transaction;
  result: SimulatedTransactionResponse;
};

export type TransactionFeedScope = "treasury" | "program" | "wallet";

export type RecentTransaction = {
  signature: string;
  slot: number;
  blockTime: number | null;
  confirmationStatus: string | null;
  err: unknown;
  memo: string | null;
};

export type TransactionFeedTarget = {
  address: string | null;
  unavailableReason: string;
};

export type RecentTransactionFeed = TransactionFeedTarget & {
  scope: TransactionFeedScope;
  transactions: RecentTransaction[];
};

const RECENT_TRANSACTION_LIMIT = 12;

export function createConnection(config: ClusterConfig): Connection {
  return new Connection(config.rpcUrl, {
    commitment: COMMITMENT,
    wsEndpoint: config.wsUrl,
  });
}

export function createTreasuryProgram(
  connection: Connection,
  wallet: AnchorWalletLike = READONLY_WALLET
): Program<ManaTreasury> {
  const provider = new AnchorProvider(connection, wallet as never, {
    commitment: COMMITMENT,
    preflightCommitment: COMMITMENT,
  });
  return new Program(
    manaTreasuryIdl as unknown as Idl,
    provider
  ) as Program<ManaTreasury>;
}

export function createCpSwapProgram(
  connection: Connection,
  config: ClusterConfig,
  wallet: AnchorWalletLike = READONLY_WALLET
): Program<RaydiumCpSwap> {
  if (!config.cpSwapProgram) {
    throw new Error("CP-swap program is not configured for this cluster.");
  }
  const provider = new AnchorProvider(connection, wallet as never, {
    commitment: COMMITMENT,
    preflightCommitment: COMMITMENT,
  });
  return new Program(
    cpSwapIdl as unknown as Idl,
    provider
  ) as Program<RaydiumCpSwap>;
}

export function resolveTransactionFeedTarget(
  config: ClusterConfig,
  scope: TransactionFeedScope,
  walletPublicKey?: PublicKey | string | null
): TransactionFeedTarget {
  if (scope === "wallet") {
    return walletPublicKey
      ? { address: walletPublicKey.toString(), unavailableReason: "" }
      : {
          address: null,
          unavailableReason: "Connect a wallet to view wallet transactions.",
        };
  }

  if (!isDeployedConfig(config)) {
    return {
      address: null,
      unavailableReason: "Treasury is not deployed on this cluster.",
    };
  }

  return {
    address:
      scope === "treasury"
        ? config.treasury.treasuryState
        : config.treasury.manaTreasuryProgram,
    unavailableReason: "",
  };
}

export async function loadRecentTransactions(
  connection: Connection,
  config: ClusterConfig,
  scope: TransactionFeedScope,
  walletPublicKey?: PublicKey | string | null
): Promise<RecentTransactionFeed> {
  const target = resolveTransactionFeedTarget(config, scope, walletPublicKey);
  if (!target.address) {
    return {
      ...target,
      scope,
      transactions: [],
    };
  }

  const signatures = await connection.getSignaturesForAddress(
    new PublicKey(target.address),
    { limit: RECENT_TRANSACTION_LIMIT },
    "confirmed"
  );

  return {
    ...target,
    scope,
    transactions: signatures.map((signature) => ({
      signature: signature.signature,
      slot: signature.slot,
      blockTime: signature.blockTime ?? null,
      confirmationStatus: signature.confirmationStatus ?? null,
      err: signature.err ?? null,
      memo: signature.memo ?? null,
    })),
  };
}

export async function loadTreasurySnapshot(
  connection: Connection,
  config: ClusterConfig,
  owner?: PublicKey | null
): Promise<TreasurySnapshot | null> {
  if (!isDeployedConfig(config)) {
    return null;
  }

  const program = createTreasuryProgram(connection);
  const addresses = publicKeys(config);
  const state = await program.account.treasuryState.fetch(
    addresses.treasuryState
  );

  const [
    reserveMint,
    manaMint,
    activeReserveVault,
    pendingReserveVault,
    pendingManaVault,
  ] = await Promise.all([
    getMint(
      connection,
      addresses.reserveMint,
      COMMITMENT,
      addresses.reserveTokenProgram
    ),
    getMint(connection, addresses.manaMint, COMMITMENT, TOKEN_PROGRAM_ID),
    getAccount(
      connection,
      addresses.activeReserveVault,
      COMMITMENT,
      addresses.reserveTokenProgram
    ),
    getAccount(
      connection,
      addresses.pendingReserveVault,
      COMMITMENT,
      addresses.reserveTokenProgram
    ),
    getAccount(
      connection,
      addresses.pendingManaVault,
      COMMITMENT,
      TOKEN_PROGRAM_ID
    ),
  ]);

  const pendingManaSupply = BigInt(state.pendingManaSupply.toString());
  const activeManaSupply = manaMint.supply - pendingManaSupply;
  const validationErrors = validateTreasuryState(config, state);
  const snapshot: TreasurySnapshot = {
    treasuryState: {
      authority: state.authority.toString(),
      pendingAuthority: state.pendingAuthority.toString(),
      reserveMint: state.mimMint.toString(),
      manaMint: state.manaMint.toString(),
      activeReserveVault: state.activeMimVault.toString(),
      pendingReserveVault: state.pendingMimVault.toString(),
      pendingManaVault: state.pendingManaVault.toString(),
      cooldownSeconds: Number(state.cooldownSeconds.toString()),
      swapRouter: state.swapRouter.toString(),
      pendingManaSupply,
    },
    reserveMint: mintSnapshot(addresses.reserveMint, reserveMint),
    manaMint: mintSnapshot(addresses.manaMint, manaMint),
    activeReserveVault: tokenAccountSnapshot(
      addresses.activeReserveVault,
      activeReserveVault.amount
    ),
    pendingReserveVault: tokenAccountSnapshot(
      addresses.pendingReserveVault,
      pendingReserveVault.amount
    ),
    pendingManaVault: tokenAccountSnapshot(
      addresses.pendingManaVault,
      pendingManaVault.amount
    ),
    activeManaSupply,
    validationErrors,
  };

  if (owner) {
    snapshot.user = await loadUserSnapshot(connection, program, config, owner);
  }

  return snapshot;
}

export function isTreasuryAuthorityWallet(
  snapshot: TreasurySnapshot | null,
  walletPublicKey?: PublicKey | string | null
): boolean {
  return Boolean(
    snapshot &&
      walletPublicKey &&
      snapshot.treasuryState.authority === walletPublicKey.toString()
  );
}

export async function loadCpSwapPoolSnapshot(
  connection: Connection,
  config: DeployedClusterConfig,
  poolAddress: PublicKey | string
): Promise<CpSwapPoolSnapshot> {
  const program = createCpSwapProgram(connection, config);
  const addresses = publicKeys(config);
  const pool = new PublicKey(poolAddress);
  const poolState = await program.account.poolState.fetch(pool);

  const sides = await Promise.all([
    createPoolSideSnapshot(connection, addresses, {
      index: 0,
      mint: poolState.token0Mint,
      vault: poolState.token0Vault,
      tokenProgram: poolState.token0Program,
      decimals: Number(poolState.mint0Decimals),
      protocolFees: bnToBigint(poolState.protocolFeesToken0),
      fundFees: bnToBigint(poolState.fundFeesToken0),
    }),
    createPoolSideSnapshot(connection, addresses, {
      index: 1,
      mint: poolState.token1Mint,
      vault: poolState.token1Vault,
      tokenProgram: poolState.token1Program,
      decimals: Number(poolState.mint1Decimals),
      protocolFees: bnToBigint(poolState.protocolFeesToken1),
      fundFees: bnToBigint(poolState.fundFeesToken1),
    }),
  ]);

  const missingAssetVaults = sides.filter(
    (side) =>
      !side.isReserveMint &&
      (!side.assetVault?.assetVaultExists ||
        !side.assetVault.assetTokenAccountExists)
  );

  return {
    address: pool.toString(),
    ammConfig: poolState.ammConfig.toString(),
    observationKey: poolState.observationKey.toString(),
    sides: sides as [CpSwapPoolSideSnapshot, CpSwapPoolSideSnapshot],
    canSweepProtocolFees:
      missingAssetVaults.length === 0 &&
      sides.some((side) => side.protocolFees > 0n),
    canSweepFundFees:
      missingAssetVaults.length === 0 &&
      sides.some((side) => side.fundFees > 0n),
    missingAssetVaults,
  };
}

export function createDepositPreview(
  amount: bigint,
  snapshot: TreasurySnapshot,
  slippageBps: number
): TreasuryPreview {
  const estimatedOut = calculateDepositManaOut(
    amount,
    snapshot.activeReserveVault.amount,
    snapshot.activeManaSupply
  );
  return {
    rawAmount: amount,
    estimatedOut,
    minOut: applyPreviewSlippage(estimatedOut, slippageBps),
  };
}

export function createDestakePreview(
  amount: bigint,
  snapshot: TreasurySnapshot,
  slippageBps: number
): TreasuryPreview {
  const estimatedOut = calculateRedeemReserveOut(
    amount,
    snapshot.activeReserveVault.amount,
    snapshot.activeManaSupply
  );
  return {
    rawAmount: amount,
    estimatedOut,
    minOut: applyPreviewSlippage(estimatedOut, slippageBps),
  };
}

export async function buildDepositTransaction(
  connection: Connection,
  config: DeployedClusterConfig,
  owner: PublicKey,
  amount: bigint,
  minManaOut: bigint
): Promise<Transaction> {
  const program = createTreasuryProgram(connection);
  const addresses = publicKeys(config);
  const depositorReserve = getReserveAssociatedTokenAddress(addresses, owner);
  const depositorMana = getAssociatedTokenAddressSync(
    addresses.manaMint,
    owner
  );

  return program.methods
    .depositMim(new BN(amount.toString()), new BN(minManaOut.toString()))
    .accountsStrict({
      depositor: owner,
      treasuryState: addresses.treasuryState,
      treasuryAuthority: addresses.treasuryAuthority,
      mimMint: addresses.reserveMint,
      manaMint: addresses.manaMint,
      depositorMim: depositorReserve,
      depositorMana,
      activeMimVault: addresses.activeReserveVault,
      mimTokenProgram: addresses.reserveTokenProgram,
      manaTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
}

export async function buildDonateReserveTransaction(
  connection: Connection,
  config: DeployedClusterConfig,
  owner: PublicKey,
  amount: bigint
): Promise<Transaction> {
  const program = createTreasuryProgram(connection);
  const addresses = publicKeys(config);
  const donorReserve = getReserveAssociatedTokenAddress(addresses, owner);

  return program.methods
    .donateMim(new BN(amount.toString()))
    .accountsStrict({
      donor: owner,
      treasuryState: addresses.treasuryState,
      mimMint: addresses.reserveMint,
      donorMim: donorReserve,
      activeMimVault: addresses.activeReserveVault,
      mimTokenProgram: addresses.reserveTokenProgram,
    })
    .transaction();
}

export async function buildStartDestakeTransaction(
  connection: Connection,
  config: DeployedClusterConfig,
  owner: PublicKey,
  amount: bigint,
  minReserveOut: bigint
): Promise<Transaction> {
  const program = createTreasuryProgram(connection);
  const addresses = publicKeys(config);
  const ownerMana = getAssociatedTokenAddressSync(addresses.manaMint, owner);
  const redemptionRequest = deriveRedemptionRequest(
    addresses.manaTreasuryProgram,
    addresses.treasuryState,
    owner
  );

  return program.methods
    .startDestake(new BN(amount.toString()), new BN(minReserveOut.toString()))
    .accountsStrict({
      owner,
      treasuryState: addresses.treasuryState,
      treasuryAuthority: addresses.treasuryAuthority,
      mimMint: addresses.reserveMint,
      manaMint: addresses.manaMint,
      ownerMana,
      pendingManaVault: addresses.pendingManaVault,
      activeMimVault: addresses.activeReserveVault,
      pendingMimVault: addresses.pendingReserveVault,
      redemptionRequest,
      mimTokenProgram: addresses.reserveTokenProgram,
      manaTokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
}

export async function buildFinalizeDestakeTransaction(
  connection: Connection,
  config: DeployedClusterConfig,
  owner: PublicKey
): Promise<Transaction> {
  const program = createTreasuryProgram(connection);
  const addresses = publicKeys(config);
  const ownerReserve = getReserveAssociatedTokenAddress(addresses, owner);
  const redemptionRequest = deriveRedemptionRequest(
    addresses.manaTreasuryProgram,
    addresses.treasuryState,
    owner
  );

  return program.methods
    .finalizeDestake()
    .accountsStrict({
      owner,
      treasuryState: addresses.treasuryState,
      treasuryAuthority: addresses.treasuryAuthority,
      mimMint: addresses.reserveMint,
      manaMint: addresses.manaMint,
      pendingMimVault: addresses.pendingReserveVault,
      pendingManaVault: addresses.pendingManaVault,
      ownerMim: ownerReserve,
      redemptionRequest,
      mimTokenProgram: addresses.reserveTokenProgram,
      manaTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
}

export async function buildSetSwapRouterTransaction(
  connection: Connection,
  config: DeployedClusterConfig,
  authority: PublicKey,
  router: PublicKey
): Promise<Transaction> {
  const program = createTreasuryProgram(connection);
  const addresses = publicKeys(config);

  return program.methods
    .setSwapRouter(router)
    .accountsStrict({
      authority,
      treasuryState: addresses.treasuryState,
    })
    .transaction();
}

export async function buildSetCooldownSecondsTransaction(
  connection: Connection,
  config: DeployedClusterConfig,
  authority: PublicKey,
  cooldownSeconds: bigint
): Promise<Transaction> {
  const program = createTreasuryProgram(connection);
  const addresses = publicKeys(config);

  return program.methods
    .setCooldownSeconds(new BN(cooldownSeconds.toString()))
    .accountsStrict({
      authority,
      treasuryState: addresses.treasuryState,
    })
    .transaction();
}

export async function buildCreateAssetVaultTransaction(
  connection: Connection,
  config: DeployedClusterConfig,
  authority: PublicKey,
  assetMint: PublicKey,
  assetTokenProgram?: PublicKey
): Promise<Transaction> {
  const program = createTreasuryProgram(connection);
  const addresses = publicKeys(config);
  const tokenProgram =
    assetTokenProgram ?? (await loadMintOwner(connection, assetMint));
  const assetVaults = deriveAssetVaultPdas(
    addresses.manaTreasuryProgram,
    addresses.treasuryState,
    assetMint
  );

  return program.methods
    .createAssetVault()
    .accountsStrict({
      authority,
      treasuryState: addresses.treasuryState,
      treasuryAuthority: addresses.treasuryAuthority,
      assetMint,
      assetVault: assetVaults.assetVault,
      assetTokenAccount: assetVaults.assetTokenAccount,
      assetTokenProgram: tokenProgram,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
}

export async function buildCollectCpSwapFeesTransaction(
  connection: Connection,
  config: DeployedClusterConfig,
  poolAddress: PublicKey | string,
  feeKind: "protocol" | "fund"
): Promise<Transaction> {
  const program = createCpSwapProgram(connection, config);
  const cpSwapProgram = requiredCpSwapProgram(config);
  const pool = await loadCpSwapPoolSnapshot(connection, config, poolAddress);
  if (pool.missingAssetVaults.length > 0) {
    throw new Error(
      "Create missing treasury asset vaults before sweeping fees."
    );
  }

  const [side0, side1] = pool.sides;
  const amount0 = feeKind === "protocol" ? side0.protocolFees : side0.fundFees;
  const amount1 = feeKind === "protocol" ? side1.protocolFees : side1.fundFees;
  if (amount0 === 0n && amount1 === 0n) {
    throw new Error(`No ${feeKind} fees are available for this pool.`);
  }

  const accounts = {
    authority: deriveCpSwapAuthority(cpSwapProgram),
    poolState: new PublicKey(pool.address),
    ammConfig: new PublicKey(pool.ammConfig),
    token0Vault: new PublicKey(side0.vault),
    token1Vault: new PublicKey(side1.vault),
    vault0Mint: new PublicKey(side0.mint),
    vault1Mint: new PublicKey(side1.mint),
    recipientToken0Account: new PublicKey(side0.feeReceiver),
    recipientToken1Account: new PublicKey(side1.feeReceiver),
    tokenProgram: TOKEN_PROGRAM_ID,
    tokenProgram2022: TOKEN_2022_PROGRAM_ID,
  };

  const builder =
    feeKind === "protocol"
      ? program.methods.collectProtocolFee(
          new BN(amount0.toString()),
          new BN(amount1.toString())
        )
      : program.methods.collectFundFee(
          new BN(amount0.toString()),
          new BN(amount1.toString())
        );

  return builder.accountsStrict(accounts).transaction();
}

export async function buildSwapAssetToMimTransaction(
  connection: Connection,
  config: DeployedClusterConfig,
  authority: PublicKey,
  assetMint: PublicKey,
  amount: bigint,
  minMimOut: bigint,
  routerProgram: PublicKey,
  routerIxData: Uint8Array,
  remainingAccounts: AccountMeta[]
): Promise<Transaction> {
  const program = createTreasuryProgram(connection);
  const addresses = publicKeys(config);
  const assetVaults = deriveAssetVaultPdas(
    addresses.manaTreasuryProgram,
    addresses.treasuryState,
    assetMint
  );
  const sanitizedRemainingAccounts = remainingAccounts.map((account) =>
    account.pubkey.equals(addresses.treasuryAuthority)
      ? { ...account, isSigner: false }
      : account
  );

  return program.methods
    .swapAssetToMim(
      new BN(amount.toString()),
      new BN(minMimOut.toString()),
      Buffer.from(routerIxData)
    )
    .accountsStrict({
      authority,
      treasuryState: addresses.treasuryState,
      treasuryAuthority: addresses.treasuryAuthority,
      assetMint,
      assetVault: assetVaults.assetVault,
      assetTokenAccount: assetVaults.assetTokenAccount,
      activeMimVault: addresses.activeReserveVault,
      routerProgram,
    })
    .remainingAccounts(sanitizedRemainingAccounts)
    .transaction();
}

export async function buildSwapAssetToMimViaCpSwapTransaction(
  connection: Connection,
  config: DeployedClusterConfig,
  authority: PublicKey,
  assetMint: PublicKey,
  routePoolAddress: PublicKey | string,
  amount: bigint,
  minMimOut: bigint
): Promise<Transaction> {
  const cpProgram = createCpSwapProgram(connection, config);
  const addresses = publicKeys(config);
  const cpSwapProgram = requiredCpSwapProgram(config);
  const routePool = await loadCpSwapPoolSnapshot(
    connection,
    config,
    routePoolAddress
  );
  const inputSide = routePool.sides.find(
    (side) => side.mint === assetMint.toString()
  );
  const outputSide = routePool.sides.find((side) => side.isReserveMint);
  if (!inputSide || !outputSide || inputSide.index === outputSide.index) {
    throw new Error(
      "Route pool must pair the selected asset mint with the reserve mint."
    );
  }
  if (!inputSide.assetVault?.assetTokenAccountExists) {
    throw new Error("Create the selected asset vault before converting.");
  }

  const routerIx = await cpProgram.methods
    .swapBaseInput(new BN(amount.toString()), new BN(minMimOut.toString()))
    .accountsStrict({
      payer: addresses.treasuryAuthority,
      authority: deriveCpSwapAuthority(cpSwapProgram),
      ammConfig: new PublicKey(routePool.ammConfig),
      poolState: new PublicKey(routePool.address),
      inputTokenAccount: new PublicKey(inputSide.assetVault.assetTokenAccount),
      outputTokenAccount: addresses.activeReserveVault,
      inputVault: new PublicKey(inputSide.vault),
      outputVault: new PublicKey(outputSide.vault),
      inputTokenProgram: new PublicKey(inputSide.tokenProgram),
      outputTokenProgram: new PublicKey(outputSide.tokenProgram),
      inputTokenMint: new PublicKey(inputSide.mint),
      outputTokenMint: addresses.reserveMint,
      observationState: new PublicKey(routePool.observationKey),
    })
    .instruction();

  return buildSwapAssetToMimTransaction(
    connection,
    config,
    authority,
    assetMint,
    amount,
    minMimOut,
    cpSwapProgram,
    routerIx.data,
    routerIx.keys
  );
}

export async function simulateTreasuryTransaction(
  connection: Connection,
  transaction: Transaction,
  feePayer: PublicKey
): Promise<PreparedSimulation> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash(COMMITMENT);
  transaction.feePayer = feePayer;
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;

  const result = await connection.simulateTransaction(transaction);

  return { transaction, result: result.value };
}

async function createPoolSideSnapshot(
  connection: Connection,
  addresses: ReturnType<typeof publicKeys>,
  side: {
    index: 0 | 1;
    mint: PublicKey;
    vault: PublicKey;
    tokenProgram: PublicKey;
    decimals: number;
    protocolFees: bigint;
    fundFees: bigint;
  }
): Promise<CpSwapPoolSideSnapshot> {
  const isReserveMint = side.mint.equals(addresses.reserveMint);
  const assetVault = isReserveMint
    ? null
    : await loadAssetVaultSnapshot(
        connection,
        addresses,
        side.mint,
        side.tokenProgram
      );

  return {
    index: side.index,
    mint: side.mint.toString(),
    vault: side.vault.toString(),
    tokenProgram: side.tokenProgram.toString(),
    decimals: side.decimals,
    protocolFees: side.protocolFees,
    fundFees: side.fundFees,
    feeReceiver: isReserveMint
      ? addresses.activeReserveVault.toString()
      : assetVault?.assetTokenAccount ?? "",
    isReserveMint,
    assetVault,
  };
}

async function loadAssetVaultSnapshot(
  connection: Connection,
  addresses: ReturnType<typeof publicKeys>,
  assetMint: PublicKey,
  tokenProgram: PublicKey
): Promise<AssetVaultSnapshot> {
  const assetVaults = deriveAssetVaultPdas(
    addresses.manaTreasuryProgram,
    addresses.treasuryState,
    assetMint
  );
  const [assetVaultInfo, assetTokenAccount] = await Promise.all([
    connection.getAccountInfo(assetVaults.assetVault, COMMITMENT),
    loadOptionalTokenAccount(
      connection,
      assetVaults.assetTokenAccount,
      tokenProgram
    ),
  ]);

  return {
    assetVault: assetVaults.assetVault.toString(),
    assetTokenAccount: assetVaults.assetTokenAccount.toString(),
    assetVaultExists: assetVaultInfo !== null,
    assetTokenAccountExists: assetTokenAccount !== null,
    amount: assetTokenAccount?.amount ?? null,
  };
}

function bnToBigint(value: { toString(): string }): bigint {
  return BigInt(value.toString());
}

async function loadMintOwner(
  connection: Connection,
  mint: PublicKey
): Promise<PublicKey> {
  const account = await connection.getAccountInfo(mint, COMMITMENT);
  if (!account) {
    throw new Error(`Mint account not found: ${mint.toString()}`);
  }
  return account.owner;
}

function requiredCpSwapProgram(config: ClusterConfig): PublicKey {
  if (!config.cpSwapProgram) {
    throw new Error("CP-swap program is not configured for this cluster.");
  }
  return new PublicKey(config.cpSwapProgram);
}

async function loadUserSnapshot(
  connection: Connection,
  program: Program<ManaTreasury>,
  config: DeployedClusterConfig,
  owner: PublicKey
): Promise<NonNullable<TreasurySnapshot["user"]>> {
  const addresses = publicKeys(config);
  const reserveAta = getReserveAssociatedTokenAddress(addresses, owner);
  const manaAta = getAssociatedTokenAddressSync(addresses.manaMint, owner);
  const redemptionAddress = deriveRedemptionRequest(
    addresses.manaTreasuryProgram,
    addresses.treasuryState,
    owner
  );
  const [reserveAccount, manaAccount, redemptionAccountInfo] =
    await Promise.all([
      loadOptionalTokenAccount(
        connection,
        reserveAta,
        addresses.reserveTokenProgram
      ),
      loadOptionalTokenAccount(connection, manaAta),
      connection.getAccountInfo(redemptionAddress, COMMITMENT),
    ]);

  let redemptionRequest: RedemptionSnapshot | null = null;
  if (redemptionAccountInfo) {
    const redemption = await program.account.redemptionRequest.fetch(
      redemptionAddress
    );
    redemptionRequest = {
      address: redemptionAddress.toString(),
      manaAmount: BigInt(redemption.manaAmount.toString()),
      reservedReserveAmount: BigInt(redemption.reservedMimAmount.toString()),
      unlockTimestamp: Number(redemption.unlockTimestamp.toString()),
      finalized: redemption.finalized,
    };
  }

  return {
    reserveAta: reserveAta.toString(),
    reserveAtaExists: reserveAccount !== null,
    reserveBalance: reserveAccount?.amount ?? 0n,
    manaAta: manaAta.toString(),
    manaAtaExists: manaAccount !== null,
    manaBalance: manaAccount?.amount ?? 0n,
    redemptionRequest,
  };
}

async function loadOptionalTokenAccount(
  connection: Connection,
  address: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
) {
  const accountInfo = await connection.getAccountInfo(address, COMMITMENT);
  if (!accountInfo) {
    return null;
  }
  return getAccount(connection, address, COMMITMENT, tokenProgram);
}

function publicKeys(config: DeployedClusterConfig) {
  const { treasury } = config;
  return {
    manaTreasuryProgram: new PublicKey(treasury.manaTreasuryProgram),
    treasuryState: new PublicKey(treasury.treasuryState),
    treasuryAuthority: new PublicKey(treasury.treasuryAuthority),
    reserveMint: new PublicKey(treasury.reserveMint),
    reserveTokenProgram: new PublicKey(treasury.reserveTokenProgram),
    manaMint: new PublicKey(treasury.manaMint),
    activeReserveVault: new PublicKey(treasury.activeReserveVault),
    pendingReserveVault: new PublicKey(treasury.pendingReserveVault),
    pendingManaVault: new PublicKey(treasury.pendingManaVault),
  };
}

function getReserveAssociatedTokenAddress(
  addresses: ReturnType<typeof publicKeys>,
  owner: PublicKey
): PublicKey {
  // The reserve path supports our current MIM Token-2022 mint shape: no transfer
  // fees, hooks, memo requirements, or other transfer-affecting extensions.
  // Those extensions need explicit accounting and transaction-building support.
  return getAssociatedTokenAddressSync(
    addresses.reserveMint,
    owner,
    false,
    addresses.reserveTokenProgram
  );
}

function mintSnapshot(
  address: PublicKey,
  mint: Awaited<ReturnType<typeof getMint>>
): MintSnapshot {
  return {
    address: address.toString(),
    decimals: mint.decimals,
    supply: mint.supply,
  };
}

function tokenAccountSnapshot(
  address: PublicKey,
  amount: bigint
): TokenAccountSnapshot {
  return {
    address: address.toString(),
    amount,
  };
}

function validateTreasuryState(
  config: DeployedClusterConfig,
  state: Awaited<
    ReturnType<Program<ManaTreasury>["account"]["treasuryState"]["fetch"]>
  >
): string[] {
  const expected = config.treasury;
  const checks: Array<[string, string, string]> = [
    ["reserve mint", state.mimMint.toString(), expected.reserveMint],
    ["Mana mint", state.manaMint.toString(), expected.manaMint],
    [
      "active reserve vault",
      state.activeMimVault.toString(),
      expected.activeReserveVault,
    ],
    [
      "pending reserve vault",
      state.pendingMimVault.toString(),
      expected.pendingReserveVault,
    ],
    [
      "pending Mana vault",
      state.pendingManaVault.toString(),
      expected.pendingManaVault,
    ],
  ];

  return checks
    .filter(([, actual, configured]) => actual !== configured)
    .map(
      ([label, actual, configured]) =>
        `${label} mismatch: chain=${actual}, config=${configured}`
    );
}

function applyPreviewSlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}
