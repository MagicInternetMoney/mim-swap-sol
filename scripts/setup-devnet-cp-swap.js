#!/usr/bin/env node
const anchor = require("@coral-xyz/anchor");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} = require("@solana/web3.js");
const {
  ACCOUNT_SIZE,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createInitializeAccountInstruction,
  getAccount,
} = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const ADMIN_KEYPAIR =
  process.env.ADMIN_KEYPAIR ||
  path.join(ROOT_DIR, "target/deploy/mim_admin-keypair.json");
const FEE_RECEIVER_KEYPAIR =
  process.env.FEE_RECEIVER_KEYPAIR ||
  path.join(ROOT_DIR, "target/deploy/create_pool_fee_receiver-keypair.json");
const TREASURY_OUTPUT =
  process.env.TREASURY_OUTPUT ||
  path.join(ROOT_DIR, "target/deploy/devnet-treasury.json");
const CP_SWAP_IDL =
  process.env.CP_SWAP_IDL ||
  path.join(ROOT_DIR, "target/idl/raydium_cp_swap.json");
const CONFIG_INDEX = Number(process.env.CP_SWAP_CONFIG_INDEX || "0");
const TRADE_FEE_RATE = process.env.TRADE_FEE_RATE || "2500";
const PROTOCOL_FEE_RATE = process.env.PROTOCOL_FEE_RATE || "200000";
const FUND_FEE_RATE = process.env.FUND_FEE_RATE || "0";
const CREATE_POOL_FEE = process.env.CREATE_POOL_FEE || "0";
const CREATOR_FEE_RATE = process.env.CREATOR_FEE_RATE || "0";

const AMM_CONFIG_SEED = Buffer.from("amm_config");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readKeypair(keypairPath) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8")))
  );
}

function u16Be(value) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);
  return bytes;
}

function deriveAmmConfig(programId, index) {
  return PublicKey.findProgramAddressSync(
    [AMM_CONFIG_SEED, u16Be(index)],
    programId
  )[0];
}

function sameKey(actual, expected) {
  return actual.toString() === expected.toString();
}

function bnString(value) {
  return value.toString();
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
  return signature;
}

async function ensureCreatePoolFeeReceiver(connection, payer, receiver) {
  const accountInfo = await connection.getAccountInfo(
    receiver.publicKey,
    "confirmed"
  );
  if (accountInfo) {
    const existing = await getAccount(
      connection,
      receiver.publicKey,
      "confirmed",
      TOKEN_PROGRAM_ID
    );
    if (
      !existing.mint.equals(NATIVE_MINT) ||
      !existing.owner.equals(payer.publicKey)
    ) {
      throw new Error(
        `create-pool fee receiver exists with unexpected mint or owner: ${receiver.publicKey.toString()}`
      );
    }
    return { created: false, address: receiver.publicKey.toString() };
  }

  const lamports = await connection.getMinimumBalanceForRentExemption(
    ACCOUNT_SIZE,
    "confirmed"
  );
  const signature = await sendTransactionWithSimulation({
    connection,
    payer,
    signers: [receiver],
    label: "create-pool fee receiver token account",
    instructions: [
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: receiver.publicKey,
        lamports,
        space: ACCOUNT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeAccountInstruction(
        receiver.publicKey,
        NATIVE_MINT,
        payer.publicKey,
        TOKEN_PROGRAM_ID
      ),
    ],
  });
  return {
    created: true,
    address: receiver.publicKey.toString(),
    signature,
  };
}

async function updateConfigValue(program, admin, ammConfig, param, value) {
  const instruction = await program.methods
    .updateAmmConfig(param, new anchor.BN(value))
    .accounts({
      owner: admin.publicKey,
      ammConfig,
    })
    .instruction();
  return sendTransactionWithSimulation({
    connection: program.provider.connection,
    payer: admin,
    instructions: [instruction],
    label: `updateAmmConfig param=${param}`,
  });
}

async function updateConfigKey(program, admin, ammConfig, param, pubkey) {
  const instruction = await program.methods
    .updateAmmConfig(param, new anchor.BN(0))
    .accounts({
      owner: admin.publicKey,
      ammConfig,
    })
    .remainingAccounts([{ pubkey, isSigner: false, isWritable: false }])
    .instruction();
  return sendTransactionWithSimulation({
    connection: program.provider.connection,
    payer: admin,
    instructions: [instruction],
    label: `updateAmmConfig param=${param}`,
  });
}

async function main() {
  if (!fs.existsSync(TREASURY_OUTPUT)) {
    throw new Error(
      `Missing ${TREASURY_OUTPUT}. Run npm run devnet:setup-treasury first.`
    );
  }
  if (!fs.existsSync(CP_SWAP_IDL)) {
    throw new Error(`Missing ${CP_SWAP_IDL}. Run anchor build first.`);
  }

  const admin = readKeypair(ADMIN_KEYPAIR);
  const feeReceiver = readKeypair(FEE_RECEIVER_KEYPAIR);
  const treasury = readJson(TREASURY_OUTPUT);
  const idl = readJson(CP_SWAP_IDL);
  const cpSwapProgramId = new PublicKey(
    process.env.CP_SWAP_PROGRAM || idl.address
  );
  idl.address = cpSwapProgramId.toString();

  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);
  const ammConfig = deriveAmmConfig(program.programId, CONFIG_INDEX);
  const expected = {
    tradeFeeRate: TRADE_FEE_RATE,
    protocolFeeRate: PROTOCOL_FEE_RATE,
    fundFeeRate: FUND_FEE_RATE,
    createPoolFee: CREATE_POOL_FEE,
    creatorFeeRate: CREATOR_FEE_RATE,
    treasuryProgram: new PublicKey(treasury.manaTreasuryProgram),
    treasuryState: new PublicKey(treasury.treasuryState),
    mimMint: new PublicKey(treasury.dmimMint),
  };

  console.log(`RPC URL: ${RPC_URL}`);
  console.log(`Admin: ${admin.publicKey.toString()}`);
  console.log(`CP-swap program: ${program.programId.toString()}`);
  console.log(`AMM config index: ${CONFIG_INDEX}`);
  console.log(`AMM config PDA: ${ammConfig.toString()}`);

  const feeReceiverResult = await ensureCreatePoolFeeReceiver(
    connection,
    admin,
    feeReceiver
  );
  console.log(
    `${
      feeReceiverResult.created ? "Created" : "Verified"
    } create-pool fee receiver: ${feeReceiverResult.address}`
  );

  const existing = await connection.getAccountInfo(ammConfig, "confirmed");
  const signatures = [];
  if (!existing) {
    const instruction = await program.methods
      .createAmmConfig(
        CONFIG_INDEX,
        new anchor.BN(expected.tradeFeeRate),
        new anchor.BN(expected.protocolFeeRate),
        new anchor.BN(expected.fundFeeRate),
        new anchor.BN(expected.createPoolFee),
        new anchor.BN(expected.creatorFeeRate),
        expected.treasuryProgram,
        expected.treasuryState,
        expected.mimMint
      )
      .accounts({
        owner: admin.publicKey,
        ammConfig,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const signature = await sendTransactionWithSimulation({
      connection,
      payer: admin,
      instructions: [instruction],
      label: "createAmmConfig",
    });
    signatures.push({ action: "createAmmConfig", signature });
  } else {
    console.log("AMM config already exists; verifying values.");
  }

  let config = await program.account.ammConfig.fetch(ammConfig);
  const valueChecks = [
    ["tradeFeeRate", 0, expected.tradeFeeRate],
    ["protocolFeeRate", 1, expected.protocolFeeRate],
    ["fundFeeRate", 2, expected.fundFeeRate],
    ["createPoolFee", 5, expected.createPoolFee],
    ["creatorFeeRate", 7, expected.creatorFeeRate],
  ];
  for (const [field, param, value] of valueChecks) {
    if (bnString(config[field]) !== value) {
      const signature = await updateConfigValue(
        program,
        admin,
        ammConfig,
        param,
        value
      );
      signatures.push({ action: `update:${field}`, signature });
      config = await program.account.ammConfig.fetch(ammConfig);
    }
  }

  const keyChecks = [
    ["treasuryProgram", 8, expected.treasuryProgram],
    ["treasuryState", 9, expected.treasuryState],
    ["mimMint", 10, expected.mimMint],
  ];
  for (const [field, param, pubkey] of keyChecks) {
    if (!sameKey(config[field], pubkey)) {
      const signature = await updateConfigKey(
        program,
        admin,
        ammConfig,
        param,
        pubkey
      );
      signatures.push({ action: `update:${field}`, signature });
      config = await program.account.ammConfig.fetch(ammConfig);
    }
  }

  const mismatches = [];
  for (const [field, , value] of valueChecks) {
    if (bnString(config[field]) !== value) {
      mismatches.push(`${field}: chain=${config[field]} expected=${value}`);
    }
  }
  for (const [field, , pubkey] of keyChecks) {
    if (!sameKey(config[field], pubkey)) {
      mismatches.push(
        `${field}: chain=${config[
          field
        ].toString()} expected=${pubkey.toString()}`
      );
    }
  }
  if (mismatches.length > 0) {
    throw new Error(
      `AMM config verification failed:\n${mismatches.join("\n")}`
    );
  }

  const output = {
    cluster: "devnet",
    rpcUrl: RPC_URL,
    cpSwapProgram: program.programId.toString(),
    ammConfig: ammConfig.toString(),
    configIndex: CONFIG_INDEX,
    createPoolFeeReceiver: feeReceiver.publicKey.toString(),
    tradeFeeRate: bnString(config.tradeFeeRate),
    protocolFeeRate: bnString(config.protocolFeeRate),
    fundFeeRate: bnString(config.fundFeeRate),
    createPoolFee: bnString(config.createPoolFee),
    creatorFeeRate: bnString(config.creatorFeeRate),
    treasuryProgram: config.treasuryProgram.toString(),
    treasuryState: config.treasuryState.toString(),
    mimMint: config.mimMint.toString(),
    signatures,
  };
  const outputPath = path.join(ROOT_DIR, "target/deploy/devnet-cp-swap.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
