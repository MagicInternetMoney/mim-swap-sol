import { PublicKey } from "@solana/web3.js";

export const AMM_CONFIG_SEED = "amm_config";
export const POOL_SEED = "pool";
export const POOL_VAULT_SEED = "pool_vault";
export const POOL_AUTH_SEED = "vault_and_lp_mint_auth_seed";
export const POOL_LP_MINT_SEED = "pool_lp_mint";
export const OBSERVATION_SEED = "observation";

function seed(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export type SortedMintPair = {
  token0Mint: PublicKey;
  token1Mint: PublicKey;
  inputWasToken0: boolean;
};

export type PoolPdas = SortedMintPair & {
  authority: PublicKey;
  poolState: PublicKey;
  lpMint: PublicKey;
  token0Vault: PublicKey;
  token1Vault: PublicKey;
  observationState: PublicKey;
};

export function comparePublicKeys(a: PublicKey, b: PublicKey): number {
  return Buffer.compare(a.toBuffer(), b.toBuffer());
}

export function sortMintPair(
  mintA: PublicKey,
  mintB: PublicKey,
): SortedMintPair {
  if (mintA.equals(mintB)) {
    throw new Error("Token mints must be different.");
  }

  const inputWasToken0 = comparePublicKeys(mintA, mintB) < 0;
  return inputWasToken0
    ? { token0Mint: mintA, token1Mint: mintB, inputWasToken0 }
    : { token0Mint: mintB, token1Mint: mintA, inputWasToken0 };
}

export function deriveAmmConfig(
  programId: PublicKey,
  index: number,
): PublicKey {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(index);
  return PublicKey.findProgramAddressSync(
    [seed(AMM_CONFIG_SEED), bytes],
    programId,
  )[0];
}

export function deriveCpSwapAuthority(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([seed(POOL_AUTH_SEED)], programId)[0];
}

export function derivePoolPdas(
  programId: PublicKey,
  ammConfig: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
): PoolPdas {
  const sorted = sortMintPair(mintA, mintB);
  const authority = deriveCpSwapAuthority(programId);
  const poolState = PublicKey.findProgramAddressSync(
    [
      seed(POOL_SEED),
      ammConfig.toBuffer(),
      sorted.token0Mint.toBuffer(),
      sorted.token1Mint.toBuffer(),
    ],
    programId,
  )[0];
  const lpMint = PublicKey.findProgramAddressSync(
    [seed(POOL_LP_MINT_SEED), poolState.toBuffer()],
    programId,
  )[0];
  const token0Vault = PublicKey.findProgramAddressSync(
    [seed(POOL_VAULT_SEED), poolState.toBuffer(), sorted.token0Mint.toBuffer()],
    programId,
  )[0];
  const token1Vault = PublicKey.findProgramAddressSync(
    [seed(POOL_VAULT_SEED), poolState.toBuffer(), sorted.token1Mint.toBuffer()],
    programId,
  )[0];
  const observationState = PublicKey.findProgramAddressSync(
    [seed(OBSERVATION_SEED), poolState.toBuffer()],
    programId,
  )[0];

  return {
    ...sorted,
    authority,
    poolState,
    lpMint,
    token0Vault,
    token1Vault,
    observationState,
  };
}
