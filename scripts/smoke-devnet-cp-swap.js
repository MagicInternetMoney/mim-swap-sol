#!/usr/bin/env node
const anchor = require("@coral-xyz/anchor");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} = require("@solana/web3.js");
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} = require("@solana/spl-token");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  TOKEN_METADATA_PROGRAM_ID,
  buildLpMetadata,
  deriveMetadataPda,
  readMetadataText,
} = require("./lp-metadata");

const ROOT_DIR = path.resolve(__dirname, "..");
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const ADMIN_KEYPAIR =
  process.env.ADMIN_KEYPAIR ||
  path.join(ROOT_DIR, "target/deploy/mim_admin-keypair.json");
const TREASURY_OUTPUT =
  process.env.TREASURY_OUTPUT ||
  path.join(ROOT_DIR, "target/deploy/devnet-treasury.json");
const CP_SWAP_OUTPUT =
  process.env.CP_SWAP_OUTPUT ||
  path.join(ROOT_DIR, "target/deploy/devnet-cp-swap.json");
const CP_SWAP_IDL =
  process.env.CP_SWAP_IDL ||
  path.join(ROOT_DIR, "target/idl/raydium_cp_swap.json");
const MANA_TREASURY_IDL =
  process.env.MANA_TREASURY_IDL ||
  path.join(ROOT_DIR, "target/idl/mana_treasury.json");
const POOL_TRADE_FEE_RATE = process.env.POOL_TRADE_FEE_RATE || "50000";
const TOKEN_DECIMALS = Number(process.env.SMOKE_TOKEN_DECIMALS || "6");
const INIT_AMOUNT = BigInt(process.env.SMOKE_INIT_AMOUNT || "100000000");
const SWAP_AMOUNT = BigInt(process.env.SMOKE_SWAP_AMOUNT || "1000000");
const ASSET_MINT_AMOUNT = BigInt(
  process.env.SMOKE_ASSET_MINT_AMOUNT || "1000000000"
);

const POOL_SEED = Buffer.from("pool");
const POOL_VAULT_SEED = Buffer.from("pool_vault");
const POOL_AUTH_SEED = Buffer.from("vault_and_lp_mint_auth_seed");
const POOL_LP_MINT_SEED = Buffer.from("pool_lp_mint");
const OBSERVATION_SEED = Buffer.from("observation");
const ASSET_VAULT_SEED = Buffer.from("asset_vault");
const ASSET_TOKEN_VAULT_SEED = Buffer.from("asset_token_vault");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readKeypair(keypairPath) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8")))
  );
}

function uniqueSigners(payer, signers) {
  const seen = new Set();
  return [payer, ...signers].filter((signer) => {
    const key = signer.publicKey.toString();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function sendTransactionWithSimulation({
  connection,
  payer,
  instructions,
  signers = [],
  label,
}) {
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  }).add(...instructions);
  const allSigners = uniqueSigners(payer, signers);
  transaction.sign(...allSigners);

  const simulation = await connection.simulateTransaction(
    transaction,
    allSigners
  );
  if (simulation.value.err) {
    if (simulation.value.logs?.length) {
      console.error(simulation.value.logs.join("\n"));
    }
    throw new Error(
      `Simulation failed for ${label}: ${JSON.stringify(simulation.value.err)}`
    );
  }
  console.log(
    `[simulate ok] ${label}: units=${simulation.value.unitsConsumed ?? "n/a"}`
  );

  const signature = await connection.sendRawTransaction(
    transaction.serialize(),
    { skipPreflight: false }
  );
  await connection.confirmTransaction(
    { signature, ...latestBlockhash },
    "confirmed"
  );
  console.log(`[tx] ${label}: ${signature}`);
  return signature;
}

function comparePubkeys(a, b) {
  return Buffer.compare(a.toBuffer(), b.toBuffer());
}

function derivePda(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function deriveAssetVaults(programId, treasuryState, mint) {
  const assetVault = derivePda(
    [ASSET_VAULT_SEED, treasuryState.toBuffer(), mint.toBuffer()],
    programId
  );
  const assetTokenAccount = derivePda(
    [ASSET_TOKEN_VAULT_SEED, treasuryState.toBuffer(), mint.toBuffer()],
    programId
  );
  return { assetVault, assetTokenAccount };
}

async function tokenAmountOrZero(connection, address) {
  try {
    return (await getAccount(connection, address, "confirmed")).amount;
  } catch (_error) {
    return 0n;
  }
}

function bn(value) {
  return new anchor.BN(value.toString());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilPoolOpen(connection, cpProgram, poolAddress) {
  const poolState = await cpProgram.account.poolState.fetch(poolAddress);
  const openTime = Number(poolState.openTime.toString());
  for (;;) {
    const slot = await connection.getSlot("confirmed");
    const blockTime = await connection.getBlockTime(slot);
    const now = blockTime ?? Math.floor(Date.now() / 1000);
    if (now >= openTime) {
      console.log(`Pool is open: now=${now} openTime=${openTime}`);
      return;
    }
    console.log(`Waiting for pool open time: now=${now} openTime=${openTime}`);
    await sleep(1000);
  }
}

async function main() {
  if (!fs.existsSync(TREASURY_OUTPUT)) {
    throw new Error(`Missing ${TREASURY_OUTPUT}`);
  }
  if (!fs.existsSync(CP_SWAP_OUTPUT)) {
    throw new Error(`Missing ${CP_SWAP_OUTPUT}. Run devnet:setup-cp-swap.`);
  }

  const admin = readKeypair(ADMIN_KEYPAIR);
  const treasury = readJson(TREASURY_OUTPUT);
  const cpConfig = readJson(CP_SWAP_OUTPUT);
  const cpIdl = readJson(CP_SWAP_IDL);
  cpIdl.address = cpConfig.cpSwapProgram;

  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  const cpProgram = new anchor.Program(cpIdl, provider);

  const ammConfig = new PublicKey(cpConfig.ammConfig);
  const dmimMint = new PublicKey(treasury.dmimMint);
  const activeMimVault = new PublicKey(treasury.activeMimVault);
  const treasuryProgram = new PublicKey(treasury.manaTreasuryProgram);
  const treasuryState = new PublicKey(treasury.treasuryState);
  const createPoolFee = new PublicKey(cpConfig.createPoolFeeReceiver);

  console.log(`RPC URL: ${RPC_URL}`);
  console.log(`Admin: ${admin.publicKey.toString()}`);
  console.log(`CP-swap program: ${cpProgram.programId.toString()}`);
  console.log(`AMM config: ${ammConfig.toString()}`);
  console.log(`DMIM mint: ${dmimMint.toString()}`);
  console.log(`Pool trade fee rate: ${POOL_TRADE_FEE_RATE}`);

  const dmimAta = getAssociatedTokenAddressSync(
    dmimMint,
    admin.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );
  const assetMint = Keypair.generate();
  const assetAta = getAssociatedTokenAddressSync(
    assetMint.publicKey,
    admin.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  const mintRent = await connection.getMinimumBalanceForRentExemption(
    MINT_SIZE,
    "confirmed"
  );
  const signatures = [];
  signatures.push({
    action: "ensureAdminDmimAta",
    signature: await sendTransactionWithSimulation({
      connection,
      payer: admin,
      label: "ensure admin DMIM ATA",
      instructions: [
        createAssociatedTokenAccountIdempotentInstruction(
          admin.publicKey,
          dmimAta,
          admin.publicKey,
          dmimMint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        ),
      ],
    }),
  });

  const dmimBalance = await tokenAmountOrZero(connection, dmimAta);
  const requiredDmim = INIT_AMOUNT + SWAP_AMOUNT;
  if (dmimBalance < requiredDmim) {
    throw new Error(
      `Admin DMIM balance ${dmimBalance} is below required ${requiredDmim}`
    );
  }

  signatures.push({
    action: "createSmokeAssetMint",
    signature: await sendTransactionWithSimulation({
      connection,
      payer: admin,
      signers: [assetMint],
      label: "create smoke asset mint and fund admin ATA",
      instructions: [
        SystemProgram.createAccount({
          fromPubkey: admin.publicKey,
          newAccountPubkey: assetMint.publicKey,
          lamports: mintRent,
          space: MINT_SIZE,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
          assetMint.publicKey,
          TOKEN_DECIMALS,
          admin.publicKey,
          null,
          TOKEN_PROGRAM_ID
        ),
        createAssociatedTokenAccountIdempotentInstruction(
          admin.publicKey,
          assetAta,
          admin.publicKey,
          assetMint.publicKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        ),
        createMintToInstruction(
          assetMint.publicKey,
          assetAta,
          admin.publicKey,
          ASSET_MINT_AMOUNT,
          [],
          TOKEN_PROGRAM_ID
        ),
      ],
    }),
  });

  const tokens = [
    { mint: dmimMint, program: TOKEN_PROGRAM_ID, ata: dmimAta, symbol: "DMIM" },
    {
      mint: assetMint.publicKey,
      program: TOKEN_PROGRAM_ID,
      ata: assetAta,
      symbol: "SMOKE",
    },
  ].sort((left, right) => comparePubkeys(left.mint, right.mint));

  const token0 = tokens[0];
  const token1 = tokens[1];
  const authority = derivePda([POOL_AUTH_SEED], cpProgram.programId);
  const poolAddress = derivePda(
    [
      POOL_SEED,
      ammConfig.toBuffer(),
      token0.mint.toBuffer(),
      token1.mint.toBuffer(),
    ],
    cpProgram.programId
  );
  const lpMint = derivePda(
    [POOL_LP_MINT_SEED, poolAddress.toBuffer()],
    cpProgram.programId
  );
  const lpMetadata = buildLpMetadata({
    token0Symbol: "DMIM",
    token1Symbol: "SMOKE",
  });
  const lpMetadataAddress = deriveMetadataPda(lpMint);
  const token0Vault = derivePda(
    [POOL_VAULT_SEED, poolAddress.toBuffer(), token0.mint.toBuffer()],
    cpProgram.programId
  );
  const token1Vault = derivePda(
    [POOL_VAULT_SEED, poolAddress.toBuffer(), token1.mint.toBuffer()],
    cpProgram.programId
  );
  const creatorLpToken = getAssociatedTokenAddressSync(
    lpMint,
    admin.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );
  const observationState = derivePda(
    [OBSERVATION_SEED, poolAddress.toBuffer()],
    cpProgram.programId
  );
  const assetVaults = deriveAssetVaults(
    treasuryProgram,
    treasuryState,
    assetMint.publicKey
  );
  const mimTreasuryBefore = await tokenAmountOrZero(connection, activeMimVault);
  const assetTreasuryBefore = await tokenAmountOrZero(
    connection,
    assetVaults.assetTokenAccount
  );

  const initializeIx = await cpProgram.methods
    .initialize(
      bn(INIT_AMOUNT),
      bn(INIT_AMOUNT),
      new anchor.BN(0),
      bn(POOL_TRADE_FEE_RATE)
    )
    .accounts({
      creator: admin.publicKey,
      ammConfig,
      authority,
      poolState: poolAddress,
      token0Mint: token0.mint,
      token1Mint: token1.mint,
      lpMint,
      creatorToken0: token0.ata,
      creatorToken1: token1.ata,
      creatorLpToken,
      token0Vault,
      token1Vault,
      createPoolFee,
      observationState,
      tokenProgram: TOKEN_PROGRAM_ID,
      token0Program: token0.program,
      token1Program: token1.program,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
  signatures.push({
    action: "initializePool",
    signature: await sendTransactionWithSimulation({
      connection,
      payer: admin,
      label: "initialize DMIM/smoke CP-swap pool",
      instructions: [initializeIx],
    }),
  });

  const metadataIx = await cpProgram.methods
    .initializeLpMetadata(lpMetadata.name, lpMetadata.symbol, lpMetadata.uri)
    .accounts({
      creator: admin.publicKey,
      authority,
      poolState: poolAddress,
      lpMint,
      metadata: lpMetadataAddress,
      metadataProgram: TOKEN_METADATA_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
  signatures.push({
    action: "initializeLpMetadata",
    signature: await sendTransactionWithSimulation({
      connection,
      payer: admin,
      label: "initialize DMIM/smoke LP metadata",
      instructions: [metadataIx],
    }),
  });
  const lpMetadataAccount = await connection.getAccountInfo(
    lpMetadataAddress,
    "confirmed"
  );
  if (!lpMetadataAccount) {
    throw new Error(
      `LP metadata account was not created: ${lpMetadataAddress.toString()}`
    );
  }
  const lpMetadataText = readMetadataText(lpMetadataAccount.data);
  await waitUntilPoolOpen(connection, cpProgram, poolAddress);

  async function swapBaseInput(input, output, label) {
    const inputVault = input.mint.equals(token0.mint)
      ? token0Vault
      : token1Vault;
    const outputVault = output.mint.equals(token0.mint)
      ? token0Vault
      : token1Vault;
    const ix = await cpProgram.methods
      .swapBaseInput(bn(SWAP_AMOUNT), new anchor.BN(0))
      .accounts({
        payer: admin.publicKey,
        authority,
        ammConfig,
        poolState: poolAddress,
        inputTokenAccount: input.ata,
        outputTokenAccount: output.ata,
        inputVault,
        outputVault,
        inputTokenProgram: input.program,
        outputTokenProgram: output.program,
        inputTokenMint: input.mint,
        outputTokenMint: output.mint,
        observationState,
      })
      .instruction();
    return sendTransactionWithSimulation({
      connection,
      payer: admin,
      label,
      instructions: [ix],
    });
  }

  signatures.push({
    action: `swap${token0.symbol}To${token1.symbol}`,
    signature: await swapBaseInput(
      token0,
      token1,
      `swap ${token0.symbol} to ${token1.symbol}`
    ),
  });
  signatures.push({
    action: `swap${token1.symbol}To${token0.symbol}`,
    signature: await swapBaseInput(
      token1,
      token0,
      `swap ${token1.symbol} to ${token0.symbol}`
    ),
  });

  const poolBeforeSweep = await cpProgram.account.poolState.fetch(poolAddress);
  const protocolFeesToken0 = BigInt(
    poolBeforeSweep.protocolFeesToken0.toString()
  );
  const protocolFeesToken1 = BigInt(
    poolBeforeSweep.protocolFeesToken1.toString()
  );
  if (protocolFeesToken0 === 0n || protocolFeesToken1 === 0n) {
    throw new Error(
      `Expected protocol fees on both sides before sweep, got token0=${protocolFeesToken0} token1=${protocolFeesToken1}`
    );
  }

  if (process.env.RUN_KEEPER !== "0") {
    execFileSync(
      process.execPath,
      [path.join(ROOT_DIR, "scripts/cp-swap-fee-keeper.js")],
      {
        cwd: ROOT_DIR,
        stdio: "inherit",
        env: {
          ...process.env,
          NO_DNA: "1",
          RPC_URL,
          ADMIN_KEYPAIR,
          TREASURY_OUTPUT,
          CP_SWAP_IDL,
          MANA_TREASURY_IDL,
          AMM_CONFIG: ammConfig.toString(),
          POOL: poolAddress.toString(),
        },
      }
    );
  }

  const mimTreasuryAfter = await tokenAmountOrZero(connection, activeMimVault);
  const assetTreasuryAfter = await tokenAmountOrZero(
    connection,
    assetVaults.assetTokenAccount
  );
  if (mimTreasuryAfter <= mimTreasuryBefore) {
    throw new Error(
      `Expected active DMIM vault to increase, before=${mimTreasuryBefore} after=${mimTreasuryAfter}`
    );
  }
  if (assetTreasuryAfter <= assetTreasuryBefore) {
    throw new Error(
      `Expected asset treasury vault to increase, before=${assetTreasuryBefore} after=${assetTreasuryAfter}`
    );
  }

  const poolAfterSweep = await cpProgram.account.poolState.fetch(poolAddress);
  const output = {
    cluster: "devnet",
    cpSwapProgram: cpProgram.programId.toString(),
    ammConfig: ammConfig.toString(),
    pool: poolAddress.toString(),
    poolTradeFeeRate: POOL_TRADE_FEE_RATE,
    lpMetadata: {
      mint: lpMint.toString(),
      metadata: lpMetadataAddress.toString(),
      name: lpMetadataText.name,
      symbol: lpMetadataText.symbol,
      uri: lpMetadataText.uri,
    },
    token0: {
      symbol: token0.symbol,
      mint: token0.mint.toString(),
      vault: token0Vault.toString(),
      protocolFeesBeforeSweep: protocolFeesToken0.toString(),
      protocolFeesAfterSweep: poolAfterSweep.protocolFeesToken0.toString(),
    },
    token1: {
      symbol: token1.symbol,
      mint: token1.mint.toString(),
      vault: token1Vault.toString(),
      protocolFeesBeforeSweep: protocolFeesToken1.toString(),
      protocolFeesAfterSweep: poolAfterSweep.protocolFeesToken1.toString(),
    },
    treasury: {
      activeMimVault: activeMimVault.toString(),
      activeMimVaultIncrease: (mimTreasuryAfter - mimTreasuryBefore).toString(),
      assetVault: assetVaults.assetVault.toString(),
      assetTokenAccount: assetVaults.assetTokenAccount.toString(),
      assetVaultIncrease: (assetTreasuryAfter - assetTreasuryBefore).toString(),
    },
    signatures,
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
