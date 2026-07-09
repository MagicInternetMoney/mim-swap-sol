#!/usr/bin/env node
const anchor = require("@coral-xyz/anchor");
const {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");
const {
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);
const TREASURY_SEED = Buffer.from("treasury");
const TREASURY_AUTHORITY_SEED = Buffer.from("treasury_authority");
const MANA_MINT_SEED = Buffer.from("mana_mint");
const ACTIVE_MIM_VAULT_SEED = Buffer.from("active_mim_vault");
const PENDING_MIM_VAULT_SEED = Buffer.from("pending_mim_vault");
const PENDING_MANA_VAULT_SEED = Buffer.from("pending_mana_vault");
const METADATA_SEED = Buffer.from("metadata");

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const ADMIN_KEYPAIR =
  process.env.ADMIN_KEYPAIR ||
  path.join(ROOT_DIR, "target/deploy/mim_admin-keypair.json");
const DMIM_DECIMALS = Number(process.env.DMIM_DECIMALS || "6");
const DMIM_SUPPLY = process.env.DMIM_SUPPLY || "1000000000";
const DEVNET_COOLDOWN_SECONDS = Number(
  process.env.DEVNET_COOLDOWN_SECONDS || "30"
);
const DMIM_NAME = process.env.DMIM_NAME || "Dev MIM";
const DMIM_SYMBOL = process.env.DMIM_SYMBOL || "DMIM";
const DMIM_METADATA_URI = process.env.DMIM_METADATA_URI || "";
const MANA_NAME = process.env.MANA_NAME || "Mana";
const MANA_SYMBOL = process.env.MANA_SYMBOL || "MANA";
const MANA_METADATA_URI = process.env.MANA_METADATA_URI || "";

function readKeypair(keypairPath) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8")))
  );
}

function deriveTreasuryPdas(programId, authority) {
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

function deriveMetadataPda(mint) {
  return PublicKey.findProgramAddressSync(
    [METADATA_SEED, TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

function encodeU16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function encodeString(value) {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

function encodeCreateMetadataAccountV3Data({ name, symbol, uri }) {
  return Buffer.concat([
    Buffer.from([33]),
    encodeString(name),
    encodeString(symbol),
    encodeString(uri),
    encodeU16(0),
    Buffer.from([0]),
    Buffer.from([0]),
    Buffer.from([0]),
    Buffer.from([1]),
    Buffer.from([0]),
  ]);
}

function createMetadataAccountV3Instruction({
  metadata,
  mint,
  mintAuthority,
  payer,
  updateAuthority,
  name,
  symbol,
  uri,
}) {
  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: mintAuthority, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: updateAuthority, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: encodeCreateMetadataAccountV3Data({ name, symbol, uri }),
  });
}

function parseUiAmount(amount, decimals) {
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > decimals) {
    throw new Error(`${amount} has more than ${decimals} decimal places`);
  }
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt((fraction || "0").padEnd(decimals, "0"))
  );
}

function readMetadataText(data) {
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

async function createMetadataIfMissing(connection, payer, args) {
  const existing = await connection.getAccountInfo(args.metadata);
  if (existing) {
    const parsed = readMetadataText(existing.data);
    console.log(
      `Metadata already exists for ${args.symbol}: ${args.metadata.toString()}`
    );
    return parsed;
  }

  const tx = new Transaction().add(createMetadataAccountV3Instruction(args));
  const signature = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
  });
  console.log(`Created ${args.symbol} metadata: ${signature}`);
  const created = await connection.getAccountInfo(args.metadata);
  if (!created) {
    throw new Error(
      `Metadata account was not created: ${args.metadata.toString()}`
    );
  }
  return readMetadataText(created.data);
}

async function main() {
  const admin = readKeypair(ADMIN_KEYPAIR);
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idlPath = path.join(ROOT_DIR, "target/idl/mana_treasury.json");
  if (!fs.existsSync(idlPath)) {
    throw new Error(
      "Missing target/idl/mana_treasury.json. Run anchor build first."
    );
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const program = new anchor.Program(idl, provider);
  const pdas = deriveTreasuryPdas(program.programId, admin.publicKey);

  console.log(`RPC URL: ${RPC_URL}`);
  console.log(`Admin: ${admin.publicKey.toString()}`);
  console.log(`Mana treasury program: ${program.programId.toString()}`);
  console.log(`Treasury state PDA: ${pdas.treasuryState.toString()}`);

  let dmimMint = process.env.DMIM_MINT
    ? new PublicKey(process.env.DMIM_MINT)
    : null;
  let createdDmim = false;
  const existingTreasury = await connection.getAccountInfo(pdas.treasuryState);

  if (existingTreasury) {
    const treasuryState = await program.account.treasuryState.fetch(
      pdas.treasuryState
    );
    dmimMint = treasuryState.mimMint;
    console.log(`Treasury already initialized with reserve mint: ${dmimMint}`);
  } else if (!dmimMint) {
    dmimMint = await createMint(
      connection,
      admin,
      admin.publicKey,
      null,
      DMIM_DECIMALS,
      undefined,
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID
    );
    createdDmim = true;
    console.log(`Created DMIM mint: ${dmimMint.toString()}`);
  }

  if (!dmimMint) {
    throw new Error("Unable to determine DMIM mint");
  }

  const dmimAta = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    dmimMint,
    admin.publicKey,
    false,
    "confirmed",
    { commitment: "confirmed" },
    TOKEN_PROGRAM_ID
  );

  if (createdDmim) {
    const mintAmount = parseUiAmount(DMIM_SUPPLY, DMIM_DECIMALS);
    const mintSig = await mintTo(
      connection,
      admin,
      dmimMint,
      dmimAta.address,
      admin,
      mintAmount,
      [],
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID
    );
    console.log(`Minted ${DMIM_SUPPLY} DMIM to admin ATA: ${mintSig}`);
  }

  const dmimMetadata = deriveMetadataPda(dmimMint);
  const dmimMetadataText = await createMetadataIfMissing(connection, admin, {
    metadata: dmimMetadata,
    mint: dmimMint,
    mintAuthority: admin.publicKey,
    payer: admin.publicKey,
    updateAuthority: admin.publicKey,
    name: DMIM_NAME,
    symbol: DMIM_SYMBOL,
    uri: DMIM_METADATA_URI,
  });

  if (!existingTreasury) {
    const initSig = await program.methods
      .initializeTreasury()
      .accounts({
        authority: admin.publicKey,
        treasuryState: pdas.treasuryState,
        treasuryAuthority: pdas.treasuryAuthority,
        mimMint: dmimMint,
        manaMint: pdas.manaMint,
        activeMimVault: pdas.activeMimVault,
        pendingMimVault: pdas.pendingMimVault,
        pendingManaVault: pdas.pendingManaVault,
        mimTokenProgram: TOKEN_PROGRAM_ID,
        manaTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc({ commitment: "confirmed" });
    console.log(`Initialized treasury: ${initSig}`);
  }

  const manaMetadata = deriveMetadataPda(pdas.manaMint);
  let manaMetadataText;
  const existingManaMetadata = await connection.getAccountInfo(manaMetadata);
  if (existingManaMetadata) {
    manaMetadataText = readMetadataText(existingManaMetadata.data);
    console.log(`Mana metadata already exists: ${manaMetadata.toString()}`);
  } else {
    const metadataSig = await program.methods
      .initializeManaMetadata(MANA_NAME, MANA_SYMBOL, MANA_METADATA_URI)
      .accounts({
        authority: admin.publicKey,
        treasuryState: pdas.treasuryState,
        treasuryAuthority: pdas.treasuryAuthority,
        manaMint: pdas.manaMint,
        metadata: manaMetadata,
        metadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([admin])
      .rpc({ commitment: "confirmed" });
    console.log(`Created Mana metadata: ${metadataSig}`);
    const createdManaMetadata = await connection.getAccountInfo(manaMetadata);
    if (!createdManaMetadata) {
      throw new Error(
        `Mana metadata account was not created: ${manaMetadata.toString()}`
      );
    }
    manaMetadataText = readMetadataText(createdManaMetadata.data);
  }

  const cooldownSig = await program.methods
    .setCooldownSeconds(new anchor.BN(DEVNET_COOLDOWN_SECONDS))
    .accounts({
      authority: admin.publicKey,
      treasuryState: pdas.treasuryState,
    })
    .signers([admin])
    .rpc({ commitment: "confirmed" });
  console.log(`Set cooldown to ${DEVNET_COOLDOWN_SECONDS}s: ${cooldownSig}`);

  const finalState = await program.account.treasuryState.fetch(
    pdas.treasuryState
  );
  const adminDmim = await getAccount(
    connection,
    dmimAta.address,
    "confirmed",
    TOKEN_PROGRAM_ID
  );
  const output = {
    cluster: "devnet",
    rpcUrl: RPC_URL,
    admin: admin.publicKey.toString(),
    manaTreasuryProgram: program.programId.toString(),
    dmimMint: dmimMint.toString(),
    dmimAta: dmimAta.address.toString(),
    dmimUiBalance: Number(adminDmim.amount) / 10 ** DMIM_DECIMALS,
    dmimMetadata: dmimMetadata.toString(),
    dmimMetadataText,
    treasuryState: pdas.treasuryState.toString(),
    treasuryAuthority: pdas.treasuryAuthority.toString(),
    manaMint: pdas.manaMint.toString(),
    manaMetadata: manaMetadata.toString(),
    manaMetadataText,
    activeMimVault: pdas.activeMimVault.toString(),
    pendingMimVault: pdas.pendingMimVault.toString(),
    pendingManaVault: pdas.pendingManaVault.toString(),
    cooldownSeconds: finalState.cooldownSeconds.toString(),
  };

  const outputPath = path.join(ROOT_DIR, "target/deploy/devnet-treasury.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
  console.log(`Wrote ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
