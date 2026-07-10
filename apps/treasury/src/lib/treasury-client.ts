import {
  AnchorProvider,
  BN,
  Program,
  type Idl,
} from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  type Commitment,
  type SimulatedTransactionResponse,
} from "@solana/web3.js";
import manaTreasuryIdl from "../idl/mana_treasury.json";
import type { ManaTreasury } from "../idl/mana_treasury";
import {
  calculateDepositManaOut,
  calculateRedeemReserveOut,
} from "./amounts";
import {
  type DeployedClusterConfig,
  isDeployedConfig,
  type ClusterConfig,
} from "./solana.config";
import { deriveRedemptionRequest } from "./pdas";

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

  const [reserveMint, manaMint, activeReserveVault, pendingReserveVault, pendingManaVault] =
    await Promise.all([
      getMint(connection, addresses.reserveMint, COMMITMENT, TOKEN_PROGRAM_ID),
      getMint(connection, addresses.manaMint, COMMITMENT, TOKEN_PROGRAM_ID),
      getAccount(
        connection,
        addresses.activeReserveVault,
        COMMITMENT,
        TOKEN_PROGRAM_ID
      ),
      getAccount(
        connection,
        addresses.pendingReserveVault,
        COMMITMENT,
        TOKEN_PROGRAM_ID
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
  const depositorReserve = getAssociatedTokenAddressSync(
    addresses.reserveMint,
    owner
  );
  const depositorMana = getAssociatedTokenAddressSync(addresses.manaMint, owner);

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
      mimTokenProgram: TOKEN_PROGRAM_ID,
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
  const donorReserve = getAssociatedTokenAddressSync(addresses.reserveMint, owner);

  return program.methods
    .donateMim(new BN(amount.toString()))
    .accountsStrict({
      donor: owner,
      treasuryState: addresses.treasuryState,
      mimMint: addresses.reserveMint,
      donorMim: donorReserve,
      activeMimVault: addresses.activeReserveVault,
      mimTokenProgram: TOKEN_PROGRAM_ID,
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
      mimTokenProgram: TOKEN_PROGRAM_ID,
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
  const ownerReserve = getAssociatedTokenAddressSync(addresses.reserveMint, owner);
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
      mimTokenProgram: TOKEN_PROGRAM_ID,
      manaTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
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

async function loadUserSnapshot(
  connection: Connection,
  program: Program<ManaTreasury>,
  config: DeployedClusterConfig,
  owner: PublicKey
): Promise<NonNullable<TreasurySnapshot["user"]>> {
  const addresses = publicKeys(config);
  const reserveAta = getAssociatedTokenAddressSync(addresses.reserveMint, owner);
  const manaAta = getAssociatedTokenAddressSync(addresses.manaMint, owner);
  const redemptionAddress = deriveRedemptionRequest(
    addresses.manaTreasuryProgram,
    addresses.treasuryState,
    owner
  );
  const [reserveAccount, manaAccount, redemptionAccountInfo] = await Promise.all([
    loadOptionalTokenAccount(connection, reserveAta),
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
      reservedReserveAmount: BigInt(
        redemption.reservedMimAmount.toString()
      ),
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
  address: PublicKey
) {
  const accountInfo = await connection.getAccountInfo(address, COMMITMENT);
  if (!accountInfo) {
    return null;
  }
  return getAccount(connection, address, COMMITMENT, TOKEN_PROGRAM_ID);
}

function publicKeys(config: DeployedClusterConfig) {
  const { treasury } = config;
  return {
    manaTreasuryProgram: new PublicKey(treasury.manaTreasuryProgram),
    treasuryState: new PublicKey(treasury.treasuryState),
    treasuryAuthority: new PublicKey(treasury.treasuryAuthority),
    reserveMint: new PublicKey(treasury.reserveMint),
    manaMint: new PublicKey(treasury.manaMint),
    activeReserveVault: new PublicKey(treasury.activeReserveVault),
    pendingReserveVault: new PublicKey(treasury.pendingReserveVault),
    pendingManaVault: new PublicKey(treasury.pendingManaVault),
  };
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
