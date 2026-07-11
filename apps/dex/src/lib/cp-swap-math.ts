import { applySlippageDown, applySlippageUp } from "./amounts";

export const FEE_RATE_DENOMINATOR = 1_000_000n;
export const DEFAULT_PROTOCOL_FEE_RATE = 200_000n;

export type SwapQuote = {
  inputAmount: bigint;
  outputAmount: bigint;
  minimumOutputAmount: bigint;
  tradeFee: bigint;
  protocolFee: bigint;
  lpFee: bigint;
  priceImpactBps: number;
};

export type DepositPreview = {
  lpTokenAmount: bigint;
  token0Amount: bigint;
  token1Amount: bigint;
  maxToken0Amount: bigint;
  maxToken1Amount: bigint;
};

export type WithdrawPreview = {
  lpTokenAmount: bigint;
  token0Amount: bigint;
  token1Amount: bigint;
  minToken0Amount: bigint;
  minToken1Amount: bigint;
};

export function quoteSwapBaseInput(params: {
  inputAmount: bigint;
  inputVaultAmount: bigint;
  outputVaultAmount: bigint;
  tradeFeeRate: bigint | number;
  protocolFeeRate?: bigint | number;
  fundFeeRate?: bigint | number;
  creatorFeeRate?: bigint | number;
  slippageBps: number;
}): SwapQuote {
  const inputAmount = params.inputAmount;
  const inputVaultAmount = params.inputVaultAmount;
  const outputVaultAmount = params.outputVaultAmount;
  const tradeFeeRate = BigInt(params.tradeFeeRate);
  const protocolFeeRate = BigInt(
    params.protocolFeeRate ?? DEFAULT_PROTOCOL_FEE_RATE,
  );
  const fundFeeRate = BigInt(params.fundFeeRate ?? 0);
  const creatorFeeRate = BigInt(params.creatorFeeRate ?? 0);

  if (inputAmount <= 0n) {
    throw new Error("Swap amount must be greater than zero.");
  }
  if (inputVaultAmount <= 0n || outputVaultAmount <= 0n) {
    throw new Error("Pool vault balances are invalid.");
  }

  const tradeFee = tradingFee(inputAmount, tradeFeeRate + creatorFeeRate);
  const inputLessFees = inputAmount - tradeFee;
  const outputAmount = swapBaseInputWithoutFees(
    inputLessFees,
    inputVaultAmount,
    outputVaultAmount,
  );
  const protocolFee = ownerFee(tradeFee, protocolFeeRate);
  const fundFee = ownerFee(tradeFee, fundFeeRate);
  const lpFee = tradeFee - protocolFee - fundFee;
  const minimumOutputAmount = applySlippageDown(
    outputAmount,
    params.slippageBps,
  );
  const noFeeOutput = swapBaseInputWithoutFees(
    inputAmount,
    inputVaultAmount,
    outputVaultAmount,
  );
  const priceImpactBps =
    noFeeOutput === 0n
      ? 0
      : Number(((noFeeOutput - outputAmount) * 10_000n) / noFeeOutput);

  return {
    inputAmount,
    outputAmount,
    minimumOutputAmount,
    tradeFee,
    protocolFee,
    lpFee,
    priceImpactBps,
  };
}

export function previewDeposit(params: {
  lpTokenAmount: bigint;
  lpSupply: bigint;
  token0VaultAmount: bigint;
  token1VaultAmount: bigint;
  slippageBps: number;
}): DepositPreview {
  if (params.lpTokenAmount <= 0n) {
    throw new Error("LP token amount must be greater than zero.");
  }
  const amounts = lpTokensToTradingTokens({
    lpTokenAmount: params.lpTokenAmount,
    lpSupply: params.lpSupply,
    token0VaultAmount: params.token0VaultAmount,
    token1VaultAmount: params.token1VaultAmount,
    roundUp: true,
  });
  return {
    lpTokenAmount: params.lpTokenAmount,
    token0Amount: amounts.token0Amount,
    token1Amount: amounts.token1Amount,
    maxToken0Amount: applySlippageUp(amounts.token0Amount, params.slippageBps),
    maxToken1Amount: applySlippageUp(amounts.token1Amount, params.slippageBps),
  };
}

export function previewWithdraw(params: {
  lpTokenAmount: bigint;
  lpSupply: bigint;
  token0VaultAmount: bigint;
  token1VaultAmount: bigint;
  slippageBps: number;
}): WithdrawPreview {
  if (params.lpTokenAmount <= 0n) {
    throw new Error("LP token amount must be greater than zero.");
  }
  const amounts = lpTokensToTradingTokens({
    lpTokenAmount: params.lpTokenAmount,
    lpSupply: params.lpSupply,
    token0VaultAmount: params.token0VaultAmount,
    token1VaultAmount: params.token1VaultAmount,
    roundUp: false,
  });
  return {
    lpTokenAmount: params.lpTokenAmount,
    token0Amount: amounts.token0Amount,
    token1Amount: amounts.token1Amount,
    minToken0Amount: applySlippageDown(
      amounts.token0Amount,
      params.slippageBps,
    ),
    minToken1Amount: applySlippageDown(
      amounts.token1Amount,
      params.slippageBps,
    ),
  };
}

export function vaultAmountWithoutFees(params: {
  vaultAmount: bigint;
  protocolFees: bigint;
  fundFees: bigint;
  creatorFees?: bigint;
}): bigint {
  const amount =
    params.vaultAmount -
    params.protocolFees -
    params.fundFees -
    (params.creatorFees ?? 0n);
  if (amount < 0n) {
    throw new Error("Vault fee accounting exceeds vault balance.");
  }
  return amount;
}

export function lpTokensToTradingTokens(params: {
  lpTokenAmount: bigint;
  lpSupply: bigint;
  token0VaultAmount: bigint;
  token1VaultAmount: bigint;
  roundUp: boolean;
}): { token0Amount: bigint; token1Amount: bigint } {
  if (params.lpSupply <= 0n) {
    throw new Error("LP supply is invalid.");
  }

  const token0Amount = mulDiv(
    params.lpTokenAmount,
    params.token0VaultAmount,
    params.lpSupply,
    params.roundUp,
  );
  const token1Amount = mulDiv(
    params.lpTokenAmount,
    params.token1VaultAmount,
    params.lpSupply,
    params.roundUp,
  );
  if (token0Amount <= 0n || token1Amount <= 0n) {
    throw new Error("LP amount is too small for this pool.");
  }
  return { token0Amount, token1Amount };
}

export function tradingFee(amount: bigint, feeRate: bigint): bigint {
  return ceilDiv(amount * feeRate, FEE_RATE_DENOMINATOR);
}

export function ownerFee(amount: bigint, feeRate: bigint): bigint {
  return (amount * feeRate) / FEE_RATE_DENOMINATOR;
}

export function swapBaseInputWithoutFees(
  inputAmount: bigint,
  inputVaultAmount: bigint,
  outputVaultAmount: bigint,
): bigint {
  return (inputAmount * outputVaultAmount) / (inputVaultAmount + inputAmount);
}

export function calculateLpShareBps(
  walletLpBalance: bigint,
  lpSupply: bigint,
): number {
  if (walletLpBalance <= 0n || lpSupply <= 0n) {
    return 0;
  }
  return Number((walletLpBalance * 10_000n) / lpSupply);
}

function mulDiv(
  amount: bigint,
  numerator: bigint,
  denominator: bigint,
  roundUp: boolean,
): bigint {
  const raw = amount * numerator;
  if (!roundUp) {
    return raw / denominator;
  }
  const floor = raw / denominator;
  const remainder = raw % denominator;
  if (remainder > 0n && floor > 0n) {
    return floor + 1n;
  }
  return floor;
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}
