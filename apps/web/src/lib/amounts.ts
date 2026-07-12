export const BPS_DENOMINATOR = 10_000n;

export function parseUiAmount(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a positive numeric amount.");
  }

  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new Error(`Amount supports at most ${decimals} decimal places.`);
  }

  const amount =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0");
  if (amount <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }
  return amount;
}

export function formatTokenAmount(
  amount: bigint | number | string | null | undefined,
  decimals: number,
  maxFractionDigits = 4,
): string {
  if (amount === null || amount === undefined) {
    return "--";
  }

  const raw = BigInt(amount.toString());
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = raw % scale;

  if (decimals === 0 || fraction === 0n || maxFractionDigits === 0) {
    return whole.toLocaleString("en-US");
  }

  const padded = fraction.toString().padStart(decimals, "0");
  const trimmed = padded.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed
    ? `${whole.toLocaleString("en-US")}.${trimmed}`
    : whole.toLocaleString("en-US");
}

export function formatPercentBps(bps: number, fractionDigits = 2): string {
  return `${(bps / 100).toFixed(fractionDigits)}%`;
}

export function formatRatio(
  numerator: bigint,
  denominator: bigint,
  fractionDigits = 4
): string {
  if (denominator === 0n) {
    return "1.0000";
  }

  const scale = 10n ** BigInt(fractionDigits);
  const ratio = (numerator * scale) / denominator;
  const whole = ratio / scale;
  const fraction = (ratio % scale).toString().padStart(fractionDigits, "0");
  return `${whole.toLocaleString("en-US")}.${fraction}`;
}

export function applySlippageDown(amount: bigint, slippageBps: number): bigint {
  validateSlippageBps(slippageBps);
  return (amount * (BPS_DENOMINATOR - BigInt(slippageBps))) / BPS_DENOMINATOR;
}

export function applySlippageUp(amount: bigint, slippageBps: number): bigint {
  validateSlippageBps(slippageBps);
  const numerator = amount * (BPS_DENOMINATOR + BigInt(slippageBps));
  return ceilDiv(numerator, BPS_DENOMINATOR);
}

export function validateSlippageBps(slippageBps: number) {
  if (
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps >= 5000
  ) {
    throw new Error("Slippage must be between 0 and 49.99%.");
  }
}

export function validatePoolFeeRate(poolTradeFeeRate: number) {
  if (!Number.isInteger(poolTradeFeeRate)) {
    throw new Error("Pool fee must be a whole rate.");
  }
  if (poolTradeFeeRate <= 0 || poolTradeFeeRate > 50_000) {
    throw new Error("Pool fee must be greater than 0 and at most 5%.");
  }
}

export function poolFeeRateToBps(poolTradeFeeRate: number): number {
  return poolTradeFeeRate / 100;
}

export function poolFeeRateToPercent(poolTradeFeeRate: number): string {
  return `${(poolTradeFeeRate / 10_000).toFixed(2)}%`;
}

export function calculateDepositManaOut(
  reserveIn: bigint,
  activeReserveBalance: bigint,
  activeManaSupply: bigint
): bigint {
  if (reserveIn <= 0n) {
    throw new Error("Deposit amount must be greater than zero.");
  }

  if (activeManaSupply === 0n) {
    return reserveIn;
  }

  if (activeReserveBalance <= 0n) {
    throw new Error("Treasury reserve balance is invalid.");
  }

  return (reserveIn * activeManaSupply) / activeReserveBalance;
}

export function calculateRedeemReserveOut(
  manaIn: bigint,
  activeReserveBalance: bigint,
  activeManaSupply: bigint
): bigint {
  if (manaIn <= 0n) {
    throw new Error("Destake amount must be greater than zero.");
  }

  if (activeManaSupply <= 0n) {
    throw new Error("Active Mana supply is invalid.");
  }

  return (manaIn * activeReserveBalance) / activeManaSupply;
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}
