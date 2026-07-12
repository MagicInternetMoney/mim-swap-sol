#!/usr/bin/env node
const anchor = require("@coral-xyz/anchor");
const {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
} = require("@solana/web3.js");
const { getMint } = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");
const {
  TOKEN_METADATA_PROGRAM_ID,
  buildLpMetadata,
  createMetadataAccountV3Instruction,
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
const POOL = process.env.POOL || "";
const LP_METADATA_URI = process.env.LP_METADATA_URI || "";
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const POOL_AUTH_SEED = Buffer.from("vault_and_lp_mint_auth_seed");
const KNOWN_TEST_ASSET_METADATA = {
  "6martsHjsobTNqPgNEmGs9hzGom7bqGQZoasMhz2P55C": {
    name: "Smoke Test Asset 1",
    symbol: "SMOK1",
    uri: "",
  },
  "4oEwB3msZYEc2DZHZrtqqF9eXreaAYLe9F7RqJ1h9NEQ": {
    name: "Smoke Test Asset 2",
    symbol: "SMOK2",
    uri: "",
  },
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readKeypair(keypairPath) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8")))
  );
}

function shortAddress(address, edge = 4) {
  return `${address.slice(0, edge)}...${address.slice(-edge)}`;
}

function sameKey(actual, expected) {
  return actual.toString() === expected.toString();
}

async function sendTransactionWithSimulation({
  connection,
  payer,
  instructions,
  label,
}) {
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  }).add(...instructions);
  transaction.sign(payer);

  const simulation = await connection.simulateTransaction(transaction, [payer]);
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
  return signature;
}

async function metadataForMint(connection, mint) {
  const metadata = deriveMetadataPda(new PublicKey(mint));
  const account = await connection.getAccountInfo(metadata, "confirmed");
  return {
    metadata,
    exists: Boolean(account),
    text: account ? readMetadataText(account.data) : null,
  };
}

async function metadataSymbolForMint(connection, mint, treasury) {
  const mintString = mint.toString();
  if (treasury?.dmimMint && mintString === treasury.dmimMint) {
    return "DMIM";
  }
  if (treasury?.manaMint && mintString === treasury.manaMint) {
    return "MANA";
  }
  if (KNOWN_TEST_ASSET_METADATA[mintString]) {
    return KNOWN_TEST_ASSET_METADATA[mintString].symbol;
  }

  const metadata = await metadataForMint(connection, mintString);
  if (metadata.text?.symbol) {
    return metadata.text.symbol;
  }

  return shortAddress(mintString, 5);
}

async function fetchPools(program, cpConfig) {
  if (POOL) {
    const pool = new PublicKey(POOL);
    const state = await program.account.poolState.fetch(pool);
    return [{ publicKey: pool, account: state }];
  }

  return program.account.poolState.all([
    { memcmp: { offset: 8, bytes: cpConfig.ammConfig } },
  ]);
}

async function buildTokenMetadataTasks({ connection, admin, pools, treasury }) {
  const uniqueMints = new Map();
  for (const { account } of pools) {
    uniqueMints.set(account.token0Mint.toString(), account.token0Mint);
    uniqueMints.set(account.token1Mint.toString(), account.token1Mint);
  }

  const tasks = [];
  const skipped = [];
  for (const [mintString, mint] of uniqueMints) {
    const desired = KNOWN_TEST_ASSET_METADATA[mintString];
    if (!desired) {
      continue;
    }

    const metadata = await metadataForMint(connection, mintString);
    if (metadata.exists) {
      skipped.push({
        type: "token",
        mint: mintString,
        metadata: metadata.metadata.toString(),
        reason: "metadata exists",
        text: metadata.text,
      });
      continue;
    }

    const mintInfo = await connection.getAccountInfo(mint, "confirmed");
    if (!mintInfo) {
      throw new Error(`Mint not found: ${mintString}`);
    }
    const parsedMint = await getMint(
      connection,
      mint,
      "confirmed",
      mintInfo.owner
    );
    if (
      !parsedMint.mintAuthority ||
      !sameKey(parsedMint.mintAuthority, admin.publicKey)
    ) {
      skipped.push({
        type: "token",
        mint: mintString,
        metadata: metadata.metadata.toString(),
        reason: `admin is not mint authority: ${
          parsedMint.mintAuthority?.toString() ?? "none"
        }`,
      });
      continue;
    }

    tasks.push({
      type: "token",
      mint,
      metadata: metadata.metadata,
      desired,
      instruction: createMetadataAccountV3Instruction({
        metadata: metadata.metadata,
        mint,
        mintAuthority: admin.publicKey,
        payer: admin.publicKey,
        updateAuthority: admin.publicKey,
        ...desired,
      }),
    });
  }

  return { tasks, skipped };
}

async function buildLpMetadataTasks({
  program,
  connection,
  admin,
  pools,
  treasury,
}) {
  const authority = PublicKey.findProgramAddressSync(
    [POOL_AUTH_SEED],
    program.programId
  )[0];
  const tasks = [];
  const skipped = [];

  for (const { publicKey: pool, account: poolState } of pools) {
    const lpMint = poolState.lpMint;
    const metadata = await metadataForMint(connection, lpMint.toString());
    if (metadata.exists) {
      skipped.push({
        type: "lp",
        pool: pool.toString(),
        lpMint: lpMint.toString(),
        metadata: metadata.metadata.toString(),
        reason: "metadata exists",
        text: metadata.text,
      });
      continue;
    }

    if (!sameKey(admin.publicKey, poolState.poolCreator)) {
      skipped.push({
        type: "lp",
        pool: pool.toString(),
        lpMint: lpMint.toString(),
        metadata: metadata.metadata.toString(),
        reason: `admin is not pool creator: ${poolState.poolCreator.toString()}`,
      });
      continue;
    }

    const token0Symbol = await metadataSymbolForMint(
      connection,
      poolState.token0Mint,
      treasury
    );
    const token1Symbol = await metadataSymbolForMint(
      connection,
      poolState.token1Mint,
      treasury
    );
    const displaySymbols =
      token0Symbol === "DMIM"
        ? [token0Symbol, token1Symbol]
        : token1Symbol === "DMIM"
        ? [token1Symbol, token0Symbol]
        : [token0Symbol, token1Symbol];
    const desired = buildLpMetadata({
      token0Symbol: displaySymbols[0],
      token1Symbol: displaySymbols[1],
      uri: LP_METADATA_URI,
    });
    const instruction = await program.methods
      .initializeLpMetadata(desired.name, desired.symbol, desired.uri)
      .accounts({
        creator: admin.publicKey,
        authority,
        poolState: pool,
        lpMint,
        metadata: metadata.metadata,
        metadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .instruction();

    tasks.push({
      type: "lp",
      pool,
      lpMint,
      metadata: metadata.metadata,
      desired,
      instruction,
    });
  }

  return { tasks, skipped };
}

function printInventory({ cpConfig, pools, tasks, skipped, dryRun }) {
  const summary = {
    cluster: "devnet",
    dryRun,
    cpSwapProgram: cpConfig.cpSwapProgram,
    ammConfig: cpConfig.ammConfig,
    poolCount: pools.length,
    missingMetadataCount: tasks.length,
    tasks: tasks.map((task) => ({
      type: task.type,
      pool: task.pool?.toString(),
      mint: task.mint?.toString() ?? task.lpMint?.toString(),
      metadata: task.metadata.toString(),
      name: task.desired.name,
      symbol: task.desired.symbol,
      uri: task.desired.uri,
    })),
    skipped,
  };
  console.log(JSON.stringify(summary, null, 2));
}

async function verifyTasks(connection, tasks) {
  const verified = [];
  for (const task of tasks) {
    const account = await connection.getAccountInfo(task.metadata, "confirmed");
    if (!account) {
      throw new Error(`Metadata account missing: ${task.metadata.toString()}`);
    }
    const text = readMetadataText(account.data);
    if (
      text.name !== task.desired.name ||
      text.symbol !== task.desired.symbol ||
      text.uri !== task.desired.uri
    ) {
      throw new Error(
        `Metadata mismatch for ${task.metadata.toString()}: ${JSON.stringify(
          text
        )} expected ${JSON.stringify(task.desired)}`
      );
    }
    verified.push({
      type: task.type,
      pool: task.pool?.toString(),
      mint: task.mint?.toString() ?? task.lpMint?.toString(),
      metadata: task.metadata.toString(),
      text,
    });
  }
  return verified;
}

async function main() {
  if (!fs.existsSync(CP_SWAP_OUTPUT)) {
    throw new Error(`Missing ${CP_SWAP_OUTPUT}. Run devnet:setup-cp-swap.`);
  }
  if (!fs.existsSync(CP_SWAP_IDL)) {
    throw new Error(`Missing ${CP_SWAP_IDL}. Run anchor build first.`);
  }

  const admin = readKeypair(ADMIN_KEYPAIR);
  const cpConfig = readJson(CP_SWAP_OUTPUT);
  const treasury = fs.existsSync(TREASURY_OUTPUT)
    ? readJson(TREASURY_OUTPUT)
    : null;
  const idl = readJson(CP_SWAP_IDL);
  idl.address = cpConfig.cpSwapProgram;

  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);
  const pools = await fetchPools(program, cpConfig);
  const tokenResult = await buildTokenMetadataTasks({
    connection,
    admin,
    pools,
    treasury,
  });
  const lpResult = await buildLpMetadataTasks({
    program,
    connection,
    admin,
    pools,
    treasury,
  });
  const tasks = [...tokenResult.tasks, ...lpResult.tasks];
  const skipped = [...tokenResult.skipped, ...lpResult.skipped];

  printInventory({ cpConfig, pools, tasks, skipped, dryRun: DRY_RUN });
  if (DRY_RUN) {
    return;
  }

  const signatures = [];
  for (const task of tasks) {
    const signature = await sendTransactionWithSimulation({
      connection,
      payer: admin,
      instructions: [task.instruction],
      label: `${task.type} metadata ${task.desired.symbol}`,
    });
    signatures.push({
      type: task.type,
      mint: task.mint?.toString() ?? task.lpMint?.toString(),
      metadata: task.metadata.toString(),
      signature,
    });
  }

  const verified = await verifyTasks(connection, tasks);
  console.log(
    JSON.stringify(
      {
        cluster: "devnet",
        cpSwapProgram: cpConfig.cpSwapProgram,
        ammConfig: cpConfig.ammConfig,
        signatures,
        verified,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
