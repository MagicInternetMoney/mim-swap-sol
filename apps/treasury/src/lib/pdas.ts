import { PublicKey } from "@solana/web3.js";

export const TREASURY_SEED = "treasury";
export const TREASURY_AUTHORITY_SEED = "treasury_authority";
export const MANA_MINT_SEED = "mana_mint";
export const ACTIVE_MIM_VAULT_SEED = "active_mim_vault";
export const PENDING_MIM_VAULT_SEED = "pending_mim_vault";
export const PENDING_MANA_VAULT_SEED = "pending_mana_vault";
export const REDEMPTION_SEED = "redemption";
export const METADATA_SEED = "metadata";
export const ASSET_VAULT_SEED = "asset_vault";
export const ASSET_TOKEN_VAULT_SEED = "asset_token_vault";
export const CP_SWAP_AUTH_SEED = "vault_and_lp_mint_auth_seed";

function seed(value: string): Uint8Array {
  return new TextEncoder().encode(value);
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

export function deriveCpSwapAuthority(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [seed(CP_SWAP_AUTH_SEED)],
    programId
  )[0];
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
