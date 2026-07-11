import type { PoolSnapshot } from "./cp-swap-client";

export type PositionBasis = {
  pool: string;
  lpMint: string;
  token0Mint: string;
  token1Mint: string;
  token0Amount: string;
  token1Amount: string;
  lpAmount: string;
  updatedAt: number;
};

const STORAGE_KEY = "mim-dex-position-basis-v1";

export function loadPositionBasis(pool: string): PositionBasis | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  const all = readAll();
  return all[pool] ?? null;
}

export function savePositionBasis(
  pool: PoolSnapshot,
  token0Amount: bigint,
  token1Amount: bigint,
  lpAmount: bigint,
) {
  if (typeof localStorage === "undefined") {
    return;
  }
  const all = readAll();
  const existing = all[pool.address];
  all[pool.address] = {
    pool: pool.address,
    lpMint: pool.lpMint,
    token0Mint: pool.sides[0].mint,
    token1Mint: pool.sides[1].mint,
    token0Amount: (
      BigInt(existing?.token0Amount ?? "0") + token0Amount
    ).toString(),
    token1Amount: (
      BigInt(existing?.token1Amount ?? "0") + token1Amount
    ).toString(),
    lpAmount: (BigInt(existing?.lpAmount ?? "0") + lpAmount).toString(),
    updatedAt: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function positionBasisLabel(pool: PoolSnapshot): string {
  const basis = loadPositionBasis(pool.address);
  if (!basis) {
    return "Current value only";
  }
  return `Basis tracked ${new Date(basis.updatedAt).toLocaleDateString()}`;
}

function readAll(): Record<string, PositionBasis> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (_error) {
    return {};
  }
}
