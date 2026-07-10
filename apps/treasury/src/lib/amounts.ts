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

  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0")
  );
}

export function formatTokenAmount(
  amount: bigint,
  decimals: number,
  maxFractionDigits = 4
): string {
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const fraction = amount % scale;

  if (decimals === 0 || fraction === 0n || maxFractionDigits === 0) {
    return whole.toLocaleString("en-US");
  }

  const padded = fraction.toString().padStart(decimals, "0");
  const trimmed = padded.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed
    ? `${whole.toLocaleString("en-US")}.${trimmed}`
    : whole.toLocaleString("en-US");
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
  if (slippageBps < 0 || slippageBps >= Number(BPS_DENOMINATOR)) {
    throw new Error("Slippage must be between 0 and 9999 bps.");
  }

  return (amount * (BPS_DENOMINATOR - BigInt(slippageBps))) / BPS_DENOMINATOR;
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
