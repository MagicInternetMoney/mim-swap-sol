import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  type Commitment,
  type SimulatedTransactionResponse,
} from "@solana/web3.js";
import cpSwapIdl from "../idl/raydium_cp_swap.json";
import type { RaydiumCpSwap } from "../idl/raydium_cp_swap";
import {
  isDeployedConfig,
  knownTokenForMint,
  shortAddress,
  type DeployedDexClusterConfig,
  type DexClusterConfig,
} from "./config";
import { deriveCpSwapAuthority, derivePoolPdas, sortMintPair } from "./pdas";
import {
  calculateLpShareBps,
  previewDeposit,
  previewWithdraw,
  quoteSwapBaseInput,
  vaultAmountWithoutFees,
  type DepositPreview,
  type SwapQuote,
  type WithdrawPreview,
} from "./cp-swap-math";

const COMMITMENT: Commitment = "confirmed";
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

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

export type TokenSnapshot = {
  mint: string;
  tokenProgram: string;
  decimals: number;
  symbol: string;
  name: string;
};

export type PoolSideSnapshot = TokenSnapshot & {
  index: 0 | 1;
  vault: string;
  vaultAmount: bigint;
  availableAmount: bigint;
  protocolFees: bigint;
  fundFees: bigint;
  creatorFees: bigint;
};

export type PoolSnapshot = {
  address: string;
  ammConfig: string;
  authority: string;
  lpMint: string;
  observationKey: string;
  poolCreator: string;
  status: number;
  openTime: number;
  isOpen: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
  canSwap: boolean;
  lpSupply: bigint;
  poolTradeFeeRate: number;
  sides: [PoolSideSnapshot, PoolSideSnapshot];
  walletLpAta?: string;
  walletLpBalance?: bigint;
  walletShareBps?: number;
};

export type PreparedDexTransaction = {
  transaction: Transaction;
  simulation: SimulatedTransactionResponse;
  explorer?: string;
};

export type InitializePoolInput = {
  tokenAMint: PublicKey;
  tokenAProgram: PublicKey;
  tokenBMint: PublicKey;
  tokenBProgram: PublicKey;
  tokenAAmount: bigint;
  tokenBAmount: bigint;
  poolTradeFeeRate: number;
  openTime?: number;
};

export type InitializePoolAccounts = {
  creator: PublicKey;
  ammConfig: PublicKey;
  authority: PublicKey;
  poolState: PublicKey;
  token0Mint: PublicKey;
  token1Mint: PublicKey;
  lpMint: PublicKey;
  creatorToken0: PublicKey;
  creatorToken1: PublicKey;
  creatorLpToken: PublicKey;
  token0Vault: PublicKey;
  token1Vault: PublicKey;
  createPoolFee: PublicKey;
  observationState: PublicKey;
  tokenProgram: PublicKey;
  token0Program: PublicKey;
  token1Program: PublicKey;
  associatedTokenProgram: PublicKey;
  systemProgram: PublicKey;
  rent: PublicKey;
};

export function createConnection(config: DexClusterConfig): Connection {
  return new Connection(config.rpcUrl, {
    commitment: COMMITMENT,
    wsEndpoint: config.wsUrl,
  });
}

export function createCpSwapProgram(
  connection: Connection,
  config: DeployedDexClusterConfig,
  wallet: AnchorWalletLike = READONLY_WALLET,
): Program<RaydiumCpSwap> {
  const provider = new AnchorProvider(connection, wallet as never, {
    commitment: COMMITMENT,
    preflightCommitment: COMMITMENT,
  });
  const idl = {
    ...(cpSwapIdl as unknown as Idl),
    address: config.cpSwapProgram,
  };
  return new Program(idl, provider) as Program<RaydiumCpSwap>;
}

export async function loadMintSnapshot(
  connection: Connection,
  config: DexClusterConfig,
  mint: PublicKey | string,
): Promise<TokenSnapshot> {
  const mintKey = new PublicKey(mint);
  const info = await connection.getAccountInfo(mintKey, COMMITMENT);
  if (!info) {
    throw new Error(`Mint not found: ${mintKey.toString()}`);
  }
  const tokenProgram = info.owner;
  const mintAccount = await getMint(
    connection,
    mintKey,
    COMMITMENT,
    tokenProgram,
  );
  const known = knownTokenForMint(config, mintKey.toString());

  return {
    mint: mintKey.toString(),
    tokenProgram: tokenProgram.toString(),
    decimals: mintAccount.decimals,
    symbol: known?.symbol ?? shortAddress(mintKey.toString(), 5),
    name: known?.name ?? `Token ${shortAddress(mintKey.toString(), 5)}`,
  };
}

export async function loadPoolSnapshots(
  connection: Connection,
  config: DeployedDexClusterConfig,
  walletPublicKey?: PublicKey | null,
): Promise<PoolSnapshot[]> {
  const program = createCpSwapProgram(connection, config);
  const accounts = await program.account.poolState.all();
  const snapshots = await Promise.all(
    accounts
      .filter(
        (account) => account.account.ammConfig.toString() === config.ammConfig,
      )
      .map((account) =>
        createPoolSnapshot(
          connection,
          config,
          account.publicKey,
          account.account,
          walletPublicKey,
        ),
      ),
  );
  return snapshots.sort((a, b) => Number(b.lpSupply - a.lpSupply));
}

export async function loadPoolSnapshot(
  connection: Connection,
  config: DeployedDexClusterConfig,
  poolAddress: PublicKey | string,
  walletPublicKey?: PublicKey | null,
): Promise<PoolSnapshot> {
  const program = createCpSwapProgram(connection, config);
  const pool = new PublicKey(poolAddress);
  const account = await program.account.poolState.fetch(pool);
  return createPoolSnapshot(connection, config, pool, account, walletPublicKey);
}

export function filterPoolsByPair(
  pools: PoolSnapshot[],
  mintA: string,
  mintB: string,
): PoolSnapshot[] {
  return pools.filter((pool) => {
    const mints = pool.sides.map((side) => side.mint);
    return mints.includes(mintA) && mints.includes(mintB);
  });
}

export function quotePoolSwap(
  pool: PoolSnapshot,
  inputMint: string,
  outputMint: string,
  inputAmount: bigint,
  slippageBps: number,
): SwapQuote {
  const inputSide = pool.sides.find((side) => side.mint === inputMint);
  const outputSide = pool.sides.find((side) => side.mint === outputMint);
  if (!inputSide || !outputSide || inputSide.index === outputSide.index) {
    throw new Error("Pool does not contain the selected token pair.");
  }

  return quoteSwapBaseInput({
    inputAmount,
    inputVaultAmount: inputSide.availableAmount,
    outputVaultAmount: outputSide.availableAmount,
    tradeFeeRate: pool.poolTradeFeeRate,
    slippageBps,
  });
}

export function selectBestPoolForSwap(
  pools: PoolSnapshot[],
  inputMint: string,
  outputMint: string,
  inputAmount: bigint,
  slippageBps: number,
): { pool: PoolSnapshot; quote: SwapQuote } | null {
  const candidates = filterPoolsByPair(pools, inputMint, outputMint)
    .filter((pool) => pool.canSwap)
    .map((pool) => ({
      pool,
      quote: quotePoolSwap(
        pool,
        inputMint,
        outputMint,
        inputAmount,
        slippageBps,
      ),
    }))
    .sort((a, b) => Number(b.quote.outputAmount - a.quote.outputAmount));

  return candidates[0] ?? null;
}

export function previewPoolDeposit(
  pool: PoolSnapshot,
  lpTokenAmount: bigint,
  slippageBps: number,
): DepositPreview {
  return previewDeposit({
    lpTokenAmount,
    lpSupply: pool.lpSupply,
    token0VaultAmount: pool.sides[0].availableAmount,
    token1VaultAmount: pool.sides[1].availableAmount,
    slippageBps,
  });
}

export function previewPoolWithdraw(
  pool: PoolSnapshot,
  lpTokenAmount: bigint,
  slippageBps: number,
): WithdrawPreview {
  return previewWithdraw({
    lpTokenAmount,
    lpSupply: pool.lpSupply,
    token0VaultAmount: pool.sides[0].availableAmount,
    token1VaultAmount: pool.sides[1].availableAmount,
    slippageBps,
  });
}

export function buildInitializePoolAccounts(
  config: DeployedDexClusterConfig,
  owner: PublicKey,
  input: InitializePoolInput,
): InitializePoolAccounts {
  const programId = new PublicKey(config.cpSwapProgram);
  const ammConfig = new PublicKey(config.ammConfig);
  const poolPdas = derivePoolPdas(
    programId,
    ammConfig,
    input.tokenAMint,
    input.tokenBMint,
  );
  const token0Program = poolPdas.inputWasToken0
    ? input.tokenAProgram
    : input.tokenBProgram;
  const token1Program = poolPdas.inputWasToken0
    ? input.tokenBProgram
    : input.tokenAProgram;

  return {
    creator: owner,
    ammConfig,
    authority: poolPdas.authority,
    poolState: poolPdas.poolState,
    token0Mint: poolPdas.token0Mint,
    token1Mint: poolPdas.token1Mint,
    lpMint: poolPdas.lpMint,
    creatorToken0: getAssociatedTokenAddressSync(
      poolPdas.token0Mint,
      owner,
      false,
      token0Program,
    ),
    creatorToken1: getAssociatedTokenAddressSync(
      poolPdas.token1Mint,
      owner,
      false,
      token1Program,
    ),
    creatorLpToken: getAssociatedTokenAddressSync(
      poolPdas.lpMint,
      owner,
      false,
      TOKEN_PROGRAM_ID,
    ),
    token0Vault: poolPdas.token0Vault,
    token1Vault: poolPdas.token1Vault,
    createPoolFee: new PublicKey(config.createPoolFeeReceiver),
    observationState: poolPdas.observationState,
    tokenProgram: TOKEN_PROGRAM_ID,
    token0Program,
    token1Program,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  };
}

export async function buildInitializePoolTransaction(
  connection: Connection,
  config: DeployedDexClusterConfig,
  owner: PublicKey,
  input: InitializePoolInput,
): Promise<Transaction> {
  const program = createCpSwapProgram(connection, config);
  const accounts = buildInitializePoolAccounts(config, owner, input);
  const token0Amount = accounts.token0Mint.equals(input.tokenAMint)
    ? input.tokenAAmount
    : input.tokenBAmount;
  const token1Amount = accounts.token1Mint.equals(input.tokenAMint)
    ? input.tokenAAmount
    : input.tokenBAmount;

  const transaction = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      owner,
      accounts.creatorToken0,
      owner,
      accounts.token0Mint,
      accounts.token0Program,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      owner,
      accounts.creatorToken1,
      owner,
      accounts.token1Mint,
      accounts.token1Program,
    ),
  );

  const ix = await program.methods
    .initialize(
      new BN(token0Amount.toString()),
      new BN(token1Amount.toString()),
      new BN((input.openTime ?? Math.floor(Date.now() / 1000)).toString()),
      new BN(input.poolTradeFeeRate),
    )
    .accounts(accounts)
    .instruction();
  return transaction.add(ix);
}

export async function buildSwapBaseInputTransaction(params: {
  connection: Connection;
  config: DeployedDexClusterConfig;
  owner: PublicKey;
  pool: PoolSnapshot;
  inputMint: string;
  outputMint: string;
  amountIn: bigint;
  minimumAmountOut: bigint;
}): Promise<Transaction> {
  const program = createCpSwapProgram(params.connection, params.config);
  const inputSide = params.pool.sides.find(
    (side) => side.mint === params.inputMint,
  );
  const outputSide = params.pool.sides.find(
    (side) => side.mint === params.outputMint,
  );
  if (!inputSide || !outputSide || inputSide.index === outputSide.index) {
    throw new Error("Selected pool cannot swap this token pair.");
  }

  const inputMint = new PublicKey(inputSide.mint);
  const outputMint = new PublicKey(outputSide.mint);
  const inputTokenProgram = new PublicKey(inputSide.tokenProgram);
  const outputTokenProgram = new PublicKey(outputSide.tokenProgram);
  const inputTokenAccount = getAssociatedTokenAddressSync(
    inputMint,
    params.owner,
    false,
    inputTokenProgram,
  );
  const outputTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    params.owner,
    false,
    outputTokenProgram,
  );

  const ix = await program.methods
    .swapBaseInput(
      new BN(params.amountIn.toString()),
      new BN(params.minimumAmountOut.toString()),
    )
    .accounts({
      payer: params.owner,
      authority: deriveCpSwapAuthority(
        new PublicKey(params.config.cpSwapProgram),
      ),
      ammConfig: new PublicKey(params.pool.ammConfig),
      poolState: new PublicKey(params.pool.address),
      inputTokenAccount,
      outputTokenAccount,
      inputVault: new PublicKey(inputSide.vault),
      outputVault: new PublicKey(outputSide.vault),
      inputTokenProgram,
      outputTokenProgram,
      inputTokenMint: inputMint,
      outputTokenMint: outputMint,
      observationState: new PublicKey(params.pool.observationKey),
    } as never)
    .instruction();

  return new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      params.owner,
      inputTokenAccount,
      params.owner,
      inputMint,
      inputTokenProgram,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      params.owner,
      outputTokenAccount,
      params.owner,
      outputMint,
      outputTokenProgram,
    ),
    ix,
  );
}

export async function buildDepositTransaction(params: {
  connection: Connection;
  config: DeployedDexClusterConfig;
  owner: PublicKey;
  pool: PoolSnapshot;
  lpTokenAmount: bigint;
  maxToken0Amount: bigint;
  maxToken1Amount: bigint;
}): Promise<Transaction> {
  const program = createCpSwapProgram(params.connection, params.config);
  const side0 = params.pool.sides[0];
  const side1 = params.pool.sides[1];
  const lpMint = new PublicKey(params.pool.lpMint);
  const token0Mint = new PublicKey(side0.mint);
  const token1Mint = new PublicKey(side1.mint);
  const token0Program = new PublicKey(side0.tokenProgram);
  const token1Program = new PublicKey(side1.tokenProgram);
  const ownerLpToken = getAssociatedTokenAddressSync(
    lpMint,
    params.owner,
    false,
    TOKEN_PROGRAM_ID,
  );
  const token0Account = getAssociatedTokenAddressSync(
    token0Mint,
    params.owner,
    false,
    token0Program,
  );
  const token1Account = getAssociatedTokenAddressSync(
    token1Mint,
    params.owner,
    false,
    token1Program,
  );

  const ix = await program.methods
    .deposit(
      new BN(params.lpTokenAmount.toString()),
      new BN(params.maxToken0Amount.toString()),
      new BN(params.maxToken1Amount.toString()),
    )
    .accounts({
      owner: params.owner,
      authority: new PublicKey(params.pool.authority),
      poolState: new PublicKey(params.pool.address),
      ownerLpToken,
      token0Account,
      token1Account,
      token0Vault: new PublicKey(side0.vault),
      token1Vault: new PublicKey(side1.vault),
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram2022: TOKEN_2022_PROGRAM_ID,
      vault0Mint: token0Mint,
      vault1Mint: token1Mint,
      lpMint,
    } as never)
    .instruction();

  return new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      params.owner,
      ownerLpToken,
      params.owner,
      lpMint,
      TOKEN_PROGRAM_ID,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      params.owner,
      token0Account,
      params.owner,
      token0Mint,
      token0Program,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      params.owner,
      token1Account,
      params.owner,
      token1Mint,
      token1Program,
    ),
    ix,
  );
}

export async function buildWithdrawTransaction(params: {
  connection: Connection;
  config: DeployedDexClusterConfig;
  owner: PublicKey;
  pool: PoolSnapshot;
  lpTokenAmount: bigint;
  minToken0Amount: bigint;
  minToken1Amount: bigint;
}): Promise<Transaction> {
  const program = createCpSwapProgram(params.connection, params.config);
  const side0 = params.pool.sides[0];
  const side1 = params.pool.sides[1];
  const lpMint = new PublicKey(params.pool.lpMint);
  const token0Mint = new PublicKey(side0.mint);
  const token1Mint = new PublicKey(side1.mint);
  const token0Program = new PublicKey(side0.tokenProgram);
  const token1Program = new PublicKey(side1.tokenProgram);
  const ownerLpToken = getAssociatedTokenAddressSync(
    lpMint,
    params.owner,
    false,
    TOKEN_PROGRAM_ID,
  );
  const token0Account = getAssociatedTokenAddressSync(
    token0Mint,
    params.owner,
    false,
    token0Program,
  );
  const token1Account = getAssociatedTokenAddressSync(
    token1Mint,
    params.owner,
    false,
    token1Program,
  );

  const ix = await program.methods
    .withdraw(
      new BN(params.lpTokenAmount.toString()),
      new BN(params.minToken0Amount.toString()),
      new BN(params.minToken1Amount.toString()),
    )
    .accounts({
      owner: params.owner,
      authority: new PublicKey(params.pool.authority),
      poolState: new PublicKey(params.pool.address),
      ownerLpToken,
      token0Account,
      token1Account,
      token0Vault: new PublicKey(side0.vault),
      token1Vault: new PublicKey(side1.vault),
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram2022: TOKEN_2022_PROGRAM_ID,
      vault0Mint: token0Mint,
      vault1Mint: token1Mint,
      lpMint,
      memoProgram: MEMO_PROGRAM_ID,
    } as never)
    .instruction();

  return new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      params.owner,
      token0Account,
      params.owner,
      token0Mint,
      token0Program,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      params.owner,
      token1Account,
      params.owner,
      token1Mint,
      token1Program,
    ),
    ix,
  );
}

export async function prepareDexTransaction(
  connection: Connection,
  transaction: Transaction,
  feePayer: PublicKey,
): Promise<PreparedDexTransaction> {
  const latestBlockhash = await connection.getLatestBlockhash(COMMITMENT);
  transaction.feePayer = feePayer;
  transaction.recentBlockhash = latestBlockhash.blockhash;
  const simulation = await connection.simulateTransaction(transaction);
  return {
    transaction,
    simulation: simulation.value,
    explorer: undefined,
  };
}

export async function sendPreparedDexTransaction(params: {
  connection: Connection;
  wallet: AnchorWalletLike;
  prepared: PreparedDexTransaction;
}): Promise<string> {
  const signed = await params.wallet.signTransaction(
    params.prepared.transaction,
  );
  const signature = await params.connection.sendRawTransaction(
    signed.serialize(),
    { skipPreflight: false, preflightCommitment: COMMITMENT },
  );
  await params.connection.confirmTransaction(signature, COMMITMENT);
  return signature;
}

async function createPoolSnapshot(
  connection: Connection,
  config: DeployedDexClusterConfig,
  pool: PublicKey,
  poolState: Awaited<
    ReturnType<Program<RaydiumCpSwap>["account"]["poolState"]["fetch"]>
  >,
  walletPublicKey?: PublicKey | null,
): Promise<PoolSnapshot> {
  const authority = deriveCpSwapAuthority(new PublicKey(config.cpSwapProgram));
  const side0 = await createPoolSideSnapshot(connection, config, {
    index: 0,
    mint: poolState.token0Mint,
    vault: poolState.token0Vault,
    tokenProgram: poolState.token0Program,
    decimals: Number(poolState.mint0Decimals),
    protocolFees: BigInt(poolState.protocolFeesToken0.toString()),
    fundFees: BigInt(poolState.fundFeesToken0.toString()),
    creatorFees: BigInt(poolState.creatorFeesToken0.toString()),
  });
  const side1 = await createPoolSideSnapshot(connection, config, {
    index: 1,
    mint: poolState.token1Mint,
    vault: poolState.token1Vault,
    tokenProgram: poolState.token1Program,
    decimals: Number(poolState.mint1Decimals),
    protocolFees: BigInt(poolState.protocolFeesToken1.toString()),
    fundFees: BigInt(poolState.fundFeesToken1.toString()),
    creatorFees: BigInt(poolState.creatorFeesToken1.toString()),
  });
  const lpSupply = BigInt(poolState.lpSupply.toString());
  const lpMint = poolState.lpMint as PublicKey;
  const walletLpAta = walletPublicKey
    ? getAssociatedTokenAddressSync(
        lpMint,
        walletPublicKey,
        false,
        TOKEN_PROGRAM_ID,
      )
    : null;
  const walletLpBalance = walletLpAta
    ? await loadTokenAccountAmount(connection, walletLpAta, TOKEN_PROGRAM_ID)
    : undefined;
  const status = Number(poolState.status);

  return {
    address: pool.toString(),
    ammConfig: poolState.ammConfig.toString(),
    authority: authority.toString(),
    lpMint: lpMint.toString(),
    observationKey: poolState.observationKey.toString(),
    poolCreator: poolState.poolCreator.toString(),
    status,
    openTime: Number(poolState.openTime.toString()),
    isOpen:
      Math.floor(Date.now() / 1000) >= Number(poolState.openTime.toString()),
    canDeposit: isStatusBitEnabled(status, 0),
    canWithdraw: isStatusBitEnabled(status, 1),
    canSwap:
      isStatusBitEnabled(status, 2) &&
      Math.floor(Date.now() / 1000) >= Number(poolState.openTime.toString()),
    lpSupply,
    poolTradeFeeRate: Number(poolState.poolTradeFeeRate.toString()),
    sides: [side0, side1],
    walletLpAta: walletLpAta?.toString(),
    walletLpBalance,
    walletShareBps:
      walletLpBalance !== undefined
        ? calculateLpShareBps(walletLpBalance, lpSupply)
        : undefined,
  };
}

async function createPoolSideSnapshot(
  connection: Connection,
  config: DeployedDexClusterConfig,
  side: {
    index: 0 | 1;
    mint: PublicKey;
    vault: PublicKey;
    tokenProgram: PublicKey;
    decimals: number;
    protocolFees: bigint;
    fundFees: bigint;
    creatorFees: bigint;
  },
): Promise<PoolSideSnapshot> {
  const vaultAmount = await loadTokenAccountAmount(
    connection,
    side.vault,
    side.tokenProgram,
  );
  const known = knownTokenForMint(config, side.mint.toString());
  const token = known ?? {
    symbol: shortAddress(side.mint.toString(), 5),
    name: `Token ${shortAddress(side.mint.toString(), 5)}`,
  };
  const availableAmount = vaultAmountWithoutFees({
    vaultAmount,
    protocolFees: side.protocolFees,
    fundFees: side.fundFees,
    creatorFees: side.creatorFees,
  });

  return {
    index: side.index,
    mint: side.mint.toString(),
    tokenProgram: side.tokenProgram.toString(),
    decimals: side.decimals,
    symbol: token.symbol,
    name: token.name,
    vault: side.vault.toString(),
    vaultAmount,
    availableAmount,
    protocolFees: side.protocolFees,
    fundFees: side.fundFees,
    creatorFees: side.creatorFees,
  };
}

async function loadTokenAccountAmount(
  connection: Connection,
  account: PublicKey,
  tokenProgram: PublicKey,
): Promise<bigint> {
  try {
    return (await getAccount(connection, account, COMMITMENT, tokenProgram))
      .amount;
  } catch (_error) {
    return 0n;
  }
}

function isStatusBitEnabled(status: number, bit: 0 | 1 | 2): boolean {
  return (status & (1 << bit)) === 0;
}

export function assertDexDeployed(
  config: DexClusterConfig,
): asserts config is DeployedDexClusterConfig {
  if (!isDeployedConfig(config)) {
    throw new Error("CP-swap is not deployed on this cluster.");
  }
}

export function sortedTokenAmounts(input: InitializePoolInput): {
  token0Amount: bigint;
  token1Amount: bigint;
} {
  const sorted = sortMintPair(input.tokenAMint, input.tokenBMint);
  return sorted.inputWasToken0
    ? { token0Amount: input.tokenAAmount, token1Amount: input.tokenBAmount }
    : { token0Amount: input.tokenBAmount, token1Amount: input.tokenAAmount };
}
