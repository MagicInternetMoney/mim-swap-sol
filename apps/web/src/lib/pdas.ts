import { PublicKey } from "@solana/web3.js";

export const AMM_CONFIG_SEED = "amm_config";
export const POOL_SEED = "pool";
export const POOL_VAULT_SEED = "pool_vault";
export const POOL_AUTH_SEED = "vault_and_lp_mint_auth_seed";
export const POOL_LP_MINT_SEED = "pool_lp_mint";
export const OBSERVATION_SEED = "observation";
export const METADATA_SEED = "metadata";
export const TREASURY_SEED = "treasury";
export const TREASURY_AUTHORITY_SEED = "treasury_authority";
export const MANA_MINT_SEED = "mana_mint";
export const ACTIVE_MIM_VAULT_SEED = "active_mim_vault";
export const PENDING_MIM_VAULT_SEED = "pending_mim_vault";
export const PENDING_MANA_VAULT_SEED = "pending_mana_vault";
export const REDEMPTION_SEED = "redemption";
export const ASSET_VAULT_SEED = "asset_vault";
export const ASSET_TOKEN_VAULT_SEED = "asset_token_vault";
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

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
  mintB: PublicKey
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
  index: number
): PublicKey {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(index);
  return PublicKey.findProgramAddressSync(
    [seed(AMM_CONFIG_SEED), bytes],
    programId
  )[0];
}

export function deriveCpSwapAuthority(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([seed(POOL_AUTH_SEED)], programId)[0];
}

export function derivePoolPdas(
  programId: PublicKey,
  ammConfig: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey
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
    programId
  )[0];
  const lpMint = PublicKey.findProgramAddressSync(
    [seed(POOL_LP_MINT_SEED), poolState.toBuffer()],
    programId
  )[0];
  const token0Vault = PublicKey.findProgramAddressSync(
    [seed(POOL_VAULT_SEED), poolState.toBuffer(), sorted.token0Mint.toBuffer()],
    programId
  )[0];
  const token1Vault = PublicKey.findProgramAddressSync(
    [seed(POOL_VAULT_SEED), poolState.toBuffer(), sorted.token1Mint.toBuffer()],
    programId
  )[0];
  const observationState = PublicKey.findProgramAddressSync(
    [seed(OBSERVATION_SEED), poolState.toBuffer()],
    programId
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

export function deriveTokenMetadataPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      seed(METADATA_SEED),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

export function deriveTreasuryPdas(programId: PublicKey, authority: PublicKey) {
  const [treasuryState] = PublicKey.findProgramAddressSync(
    [seed(TREASURY_SEED), authority.toBuffer()],
    programId
  );
  const [treasuryAuthority] = PublicKey.findProgramAddressSync(
    [seed(TREASURY_AUTHORITY_SEED), treasuryState.toBuffer()],
    programId
  );
  const [manaMint] = PublicKey.findProgramAddressSync(
    [seed(MANA_MINT_SEED), treasuryState.toBuffer()],
    programId
  );
  const [activeReserveVault] = PublicKey.findProgramAddressSync(
    [seed(ACTIVE_MIM_VAULT_SEED), treasuryState.toBuffer()],
    programId
  );
  const [pendingReserveVault] = PublicKey.findProgramAddressSync(
    [seed(PENDING_MIM_VAULT_SEED), treasuryState.toBuffer()],
    programId
  );
  const [pendingManaVault] = PublicKey.findProgramAddressSync(
    [seed(PENDING_MANA_VAULT_SEED), treasuryState.toBuffer()],
    programId
  );

  return {
    treasuryState,
    treasuryAuthority,
    manaMint,
    activeReserveVault,
    pendingReserveVault,
    pendingManaVault,
  };
}

export function deriveRedemptionRequest(
  programId: PublicKey,
  treasuryState: PublicKey,
  owner: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [seed(REDEMPTION_SEED), treasuryState.toBuffer(), owner.toBuffer()],
    programId
  )[0];
}

export function deriveAssetVaultPdas(
  programId: PublicKey,
  treasuryState: PublicKey,
  assetMint: PublicKey
) {
  const [assetVault] = PublicKey.findProgramAddressSync(
    [seed(ASSET_VAULT_SEED), treasuryState.toBuffer(), assetMint.toBuffer()],
    programId
  );
  const [assetTokenAccount] = PublicKey.findProgramAddressSync(
    [
      seed(ASSET_TOKEN_VAULT_SEED),
      treasuryState.toBuffer(),
      assetMint.toBuffer(),
    ],
    programId
  );

  return {
    assetVault,
    assetTokenAccount,
  };
}

export function deriveMetadataPda(
  metadataProgramId: PublicKey,
  mint: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [seed(METADATA_SEED), metadataProgramId.toBuffer(), mint.toBuffer()],
    metadataProgramId
  )[0];
}
