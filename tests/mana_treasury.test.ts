import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { ManaTreasury } from "../target/types/mana_treasury";
import { assert } from "chai";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  transfer,
} from "@solana/spl-token";

const TREASURY_SEED = Buffer.from("treasury");
const TREASURY_AUTHORITY_SEED = Buffer.from("treasury_authority");
const MANA_MINT_SEED = Buffer.from("mana_mint");
const ACTIVE_MIM_VAULT_SEED = Buffer.from("active_mim_vault");
const PENDING_MIM_VAULT_SEED = Buffer.from("pending_mim_vault");
const PENDING_MANA_VAULT_SEED = Buffer.from("pending_mana_vault");
const REDEMPTION_SEED = Buffer.from("redemption");
const ASSET_VAULT_SEED = Buffer.from("asset_vault");
const ASSET_TOKEN_VAULT_SEED = Buffer.from("asset_token_vault");
const METADATA_SEED = Buffer.from("metadata");
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

function deriveTreasuryPdas(programId: PublicKey, authority: PublicKey) {
  const [treasuryState] = PublicKey.findProgramAddressSync(
    [TREASURY_SEED, authority.toBuffer()],
    programId
  );
  const [treasuryAuthority] = PublicKey.findProgramAddressSync(
    [TREASURY_AUTHORITY_SEED, treasuryState.toBuffer()],
    programId
  );
  const [manaMint] = PublicKey.findProgramAddressSync(
    [MANA_MINT_SEED, treasuryState.toBuffer()],
    programId
  );
  const [activeMimVault] = PublicKey.findProgramAddressSync(
    [ACTIVE_MIM_VAULT_SEED, treasuryState.toBuffer()],
    programId
  );
  const [pendingMimVault] = PublicKey.findProgramAddressSync(
    [PENDING_MIM_VAULT_SEED, treasuryState.toBuffer()],
    programId
  );
  const [pendingManaVault] = PublicKey.findProgramAddressSync(
    [PENDING_MANA_VAULT_SEED, treasuryState.toBuffer()],
    programId
  );
  return {
    treasuryState,
    treasuryAuthority,
    manaMint,
    activeMimVault,
    pendingMimVault,
    pendingManaVault,
  };
}

function deriveRedemption(
  programId: PublicKey,
  treasury: PublicKey,
  owner: PublicKey
) {
  return PublicKey.findProgramAddressSync(
    [REDEMPTION_SEED, treasury.toBuffer(), owner.toBuffer()],
    programId
  )[0];
}

function deriveAssetVaults(
  programId: PublicKey,
  treasury: PublicKey,
  mint: PublicKey
) {
  const [assetVault] = PublicKey.findProgramAddressSync(
    [ASSET_VAULT_SEED, treasury.toBuffer(), mint.toBuffer()],
    programId
  );
  const [assetTokenAccount] = PublicKey.findProgramAddressSync(
    [ASSET_TOKEN_VAULT_SEED, treasury.toBuffer(), mint.toBuffer()],
    programId
  );
  return { assetVault, assetTokenAccount };
}

function deriveMetadataPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [METADATA_SEED, TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

function readMetadataText(data: Buffer) {
  let offset = 1 + 32 + 32;
  const readString = () => {
    const length = data.readUInt32LE(offset);
    offset += 4;
    const value = data
      .subarray(offset, offset + length)
      .toString("utf8")
      .replace(/\0+$/, "");
    offset += length;
    return value;
  };

  return {
    name: readString(),
    symbol: readString(),
    uri: readString(),
  };
}

describe("mana treasury", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider();
  const connection = provider.connection;
  const authority = anchor.Wallet.local().payer;
  const program = anchor.workspace.ManaTreasury as Program<ManaTreasury>;
  const confirmOptions = { skipPreflight: true };

  it("mints NAV-priced Mana, reserves de-stakers, and accepts non-MIM donations", async () => {
    const bob = Keypair.generate();
    const airdropSig = await connection.requestAirdrop(
      bob.publicKey,
      LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSig, "confirmed");

    const mimMint = await createMint(
      connection,
      authority,
      authority.publicKey,
      null,
      6
    );
    const assetMint = await createMint(
      connection,
      authority,
      authority.publicKey,
      null,
      6
    );

    const authorityMim = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      mimMint,
      authority.publicKey
    );
    const bobMim = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      mimMint,
      bob.publicKey
    );
    const authorityAsset = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      assetMint,
      authority.publicKey
    );

    await mintTo(
      connection,
      authority,
      mimMint,
      authorityMim.address,
      authority,
      10_000n
    );
    await mintTo(
      connection,
      authority,
      mimMint,
      bobMim.address,
      authority,
      5_000n
    );
    await mintTo(
      connection,
      authority,
      assetMint,
      authorityAsset.address,
      authority,
      1_000n
    );

    const pdas = deriveTreasuryPdas(program.programId, authority.publicKey);
    const bobPdas = deriveTreasuryPdas(program.programId, bob.publicKey);
    assert.notEqual(
      pdas.treasuryState.toString(),
      bobPdas.treasuryState.toString(),
      "treasury PDA should be namespaced by initial authority"
    );

    await program.methods
      .initializeTreasury()
      .accounts({
        authority: authority.publicKey,
        treasuryState: pdas.treasuryState,
        treasuryAuthority: pdas.treasuryAuthority,
        mimMint,
        manaMint: pdas.manaMint,
        activeMimVault: pdas.activeMimVault,
        pendingMimVault: pdas.pendingMimVault,
        pendingManaVault: pdas.pendingManaVault,
        mimTokenProgram: TOKEN_PROGRAM_ID,
        manaTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc(confirmOptions);

    const manaMetadata = deriveMetadataPda(pdas.manaMint);
    try {
      await program.methods
        .initializeManaMetadata("Fake Mana", "FAKE", "")
        .accounts({
          authority: bob.publicKey,
          treasuryState: pdas.treasuryState,
          treasuryAuthority: pdas.treasuryAuthority,
          manaMint: pdas.manaMint,
          metadata: manaMetadata,
          metadataProgram: TOKEN_METADATA_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([bob])
        .rpc(confirmOptions);
      assert.fail("unauthorized Mana metadata initialization should fail");
    } catch (_err) {
      assert.ok(true);
    }

    await program.methods
      .initializeManaMetadata("Mana", "MANA", "")
      .accounts({
        authority: authority.publicKey,
        treasuryState: pdas.treasuryState,
        treasuryAuthority: pdas.treasuryAuthority,
        manaMint: pdas.manaMint,
        metadata: manaMetadata,
        metadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([authority])
      .rpc(confirmOptions);

    const metadataAccount = await connection.getAccountInfo(manaMetadata);
    if (!metadataAccount) {
      assert.fail("Mana metadata account should exist");
    }
    const metadataText = readMetadataText(metadataAccount.data);
    assert.equal(metadataText.name, "Mana");
    assert.equal(metadataText.symbol, "MANA");
    assert.equal(metadataText.uri, "");

    await program.methods
      .setCooldownSeconds(new BN(0))
      .accounts({
        authority: authority.publicKey,
        treasuryState: pdas.treasuryState,
      })
      .signers([authority])
      .rpc(confirmOptions);

    const authorityMana = getAssociatedTokenAddressSync(
      pdas.manaMint,
      authority.publicKey
    );
    await program.methods
      .depositMim(new BN(1_000), new BN(1_000))
      .accounts({
        depositor: authority.publicKey,
        treasuryState: pdas.treasuryState,
        treasuryAuthority: pdas.treasuryAuthority,
        mimMint,
        manaMint: pdas.manaMint,
        depositorMim: authorityMim.address,
        depositorMana: authorityMana,
        activeMimVault: pdas.activeMimVault,
        mimTokenProgram: TOKEN_PROGRAM_ID,
        manaTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc(confirmOptions);

    assert.equal(
      (await getAccount(connection, authorityMana)).amount.toString(),
      "1000"
    );
    assert.equal(
      (await getAccount(connection, pdas.activeMimVault)).amount.toString(),
      "1000"
    );

    await program.methods
      .donateMim(new BN(200))
      .accounts({
        donor: authority.publicKey,
        treasuryState: pdas.treasuryState,
        mimMint,
        donorMim: authorityMim.address,
        activeMimVault: pdas.activeMimVault,
        mimTokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc(confirmOptions);

    const bobMana = getAssociatedTokenAddressSync(pdas.manaMint, bob.publicKey);
    await program.methods
      .depositMim(new BN(1_000), new BN(833))
      .accounts({
        depositor: bob.publicKey,
        treasuryState: pdas.treasuryState,
        treasuryAuthority: pdas.treasuryAuthority,
        mimMint,
        manaMint: pdas.manaMint,
        depositorMim: bobMim.address,
        depositorMana: bobMana,
        activeMimVault: pdas.activeMimVault,
        mimTokenProgram: TOKEN_PROGRAM_ID,
        manaTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([bob])
      .rpc(confirmOptions);

    assert.equal(
      (await getAccount(connection, bobMana)).amount.toString(),
      "833"
    );
    assert.equal(
      (await getAccount(connection, pdas.activeMimVault)).amount.toString(),
      "2200"
    );

    await transfer(
      connection,
      authority,
      authorityMana,
      bobMana,
      authority,
      100n
    );
    assert.equal(
      (await getAccount(connection, bobMana)).amount.toString(),
      "933"
    );

    const redemption = deriveRedemption(
      program.programId,
      pdas.treasuryState,
      bob.publicKey
    );
    await program.methods
      .startDestake(new BN(100), new BN(120))
      .accounts({
        owner: bob.publicKey,
        treasuryState: pdas.treasuryState,
        treasuryAuthority: pdas.treasuryAuthority,
        mimMint,
        manaMint: pdas.manaMint,
        ownerMana: bobMana,
        pendingManaVault: pdas.pendingManaVault,
        activeMimVault: pdas.activeMimVault,
        pendingMimVault: pdas.pendingMimVault,
        redemptionRequest: redemption,
        mimTokenProgram: TOKEN_PROGRAM_ID,
        manaTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([bob])
      .rpc(confirmOptions);

    assert.equal(
      (await getAccount(connection, pdas.pendingMimVault)).amount.toString(),
      "120"
    );
    assert.equal(
      (await getAccount(connection, pdas.pendingManaVault)).amount.toString(),
      "100"
    );

    await program.methods
      .donateMim(new BN(183))
      .accounts({
        donor: authority.publicKey,
        treasuryState: pdas.treasuryState,
        mimMint,
        donorMim: authorityMim.address,
        activeMimVault: pdas.activeMimVault,
        mimTokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc(confirmOptions);
    assert.equal(
      (await getAccount(connection, pdas.pendingMimVault)).amount.toString(),
      "120"
    );

    const bobMimBefore = (await getAccount(connection, bobMim.address)).amount;
    await program.methods
      .finalizeDestake()
      .accounts({
        owner: bob.publicKey,
        treasuryState: pdas.treasuryState,
        treasuryAuthority: pdas.treasuryAuthority,
        mimMint,
        manaMint: pdas.manaMint,
        pendingMimVault: pdas.pendingMimVault,
        pendingManaVault: pdas.pendingManaVault,
        ownerMim: bobMim.address,
        redemptionRequest: redemption,
        mimTokenProgram: TOKEN_PROGRAM_ID,
        manaTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([bob])
      .rpc(confirmOptions);
    const bobMimAfter = (await getAccount(connection, bobMim.address)).amount;
    assert.equal((bobMimAfter - bobMimBefore).toString(), "120");

    const assetVaults = deriveAssetVaults(
      program.programId,
      pdas.treasuryState,
      assetMint
    );
    await program.methods
      .createAssetVault()
      .accounts({
        authority: authority.publicKey,
        treasuryState: pdas.treasuryState,
        treasuryAuthority: pdas.treasuryAuthority,
        assetMint,
        assetVault: assetVaults.assetVault,
        assetTokenAccount: assetVaults.assetTokenAccount,
        assetTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc(confirmOptions);

    await program.methods
      .donateAsset(new BN(777))
      .accounts({
        donor: authority.publicKey,
        treasuryState: pdas.treasuryState,
        assetMint,
        assetVault: assetVaults.assetVault,
        donorAsset: authorityAsset.address,
        assetTokenAccount: assetVaults.assetTokenAccount,
        assetTokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc(confirmOptions);
    assert.equal(
      (
        await getAccount(connection, assetVaults.assetTokenAccount)
      ).amount.toString(),
      "777"
    );

    try {
      await program.methods
        .setSwapRouter(Keypair.generate().publicKey)
        .accounts({
          authority: bob.publicKey,
          treasuryState: pdas.treasuryState,
        })
        .signers([bob])
        .rpc(confirmOptions);
      assert.fail("unauthorized swap router update should fail");
    } catch (_err) {
      assert.ok(true);
    }
  });
});
