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
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAccount,
} = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const ADMIN_KEYPAIR =
  process.env.ADMIN_KEYPAIR ||
  path.join(ROOT_DIR, "target/deploy/mim_admin-keypair.json");
const TREASURY_OUTPUT =
  process.env.TREASURY_OUTPUT ||
  path.join(ROOT_DIR, "target/deploy/devnet-treasury.json");
const CP_SWAP_IDL =
  process.env.CP_SWAP_IDL ||
  path.join(ROOT_DIR, "target/idl/raydium_cp_swap.json");
const MANA_TREASURY_IDL =
  process.env.MANA_TREASURY_IDL ||
  path.join(ROOT_DIR, "target/idl/mana_treasury.json");
const DRY_RUN = process.env.DRY_RUN === "1";
const CREATE_MISSING_VAULTS = process.env.CREATE_MISSING_VAULTS !== "0";
const SWEEP_PROTOCOL = process.env.SWEEP_PROTOCOL !== "0";
const SWEEP_FUND = process.env.SWEEP_FUND !== "0";
const AMM_CONFIG_FILTER = process.env.AMM_CONFIG
  ? new PublicKey(process.env.AMM_CONFIG)
  : null;
const POOL_FILTER = process.env.POOL ? new PublicKey(process.env.POOL) : null;

const TREASURY_AUTHORITY_SEED = Buffer.from("treasury_authority");
const ACTIVE_MIM_VAULT_SEED = Buffer.from("active_mim_vault");
const ASSET_VAULT_SEED = Buffer.from("asset_vault");
const ASSET_TOKEN_VAULT_SEED = Buffer.from("asset_token_vault");
const CP_SWAP_AUTH_SEED = Buffer.from("vault_and_lp_mint_auth_seed");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readKeypair(keypairPath) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8")))
  );
}

function loadIdl(filePath, programIdOverride) {
  const idl = readJson(filePath);
  if (programIdOverride) {
    idl.address = programIdOverride.toString();
  }
  return idl;
}

function deriveTreasuryAuthority(programId, treasuryState) {
  return PublicKey.findProgramAddressSync(
    [TREASURY_AUTHORITY_SEED, treasuryState.toBuffer()],
    programId
  )[0];
}

function deriveActiveMimVault(programId, treasuryState) {
  return PublicKey.findProgramAddressSync(
    [ACTIVE_MIM_VAULT_SEED, treasuryState.toBuffer()],
    programId
  )[0];
}

function deriveAssetVaults(programId, treasuryState, mint) {
  const assetVault = PublicKey.findProgramAddressSync(
    [ASSET_VAULT_SEED, treasuryState.toBuffer(), mint.toBuffer()],
    programId
  )[0];
  const assetTokenAccount = PublicKey.findProgramAddressSync(
    [ASSET_TOKEN_VAULT_SEED, treasuryState.toBuffer(), mint.toBuffer()],
    programId
  )[0];
  return { assetVault, assetTokenAccount };
}

function deriveCpSwapAuthority(programId) {
  return PublicKey.findProgramAddressSync([CP_SWAP_AUTH_SEED], programId)[0];
}

function bnToBigInt(value) {
  return BigInt(value.toString());
}

function sameKey(a, b) {
  return a.toString() === b.toString();
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

async function accountExists(connection, address) {
  return (await connection.getAccountInfo(address, "confirmed")) !== null;
}

async function loadTokenAccount(connection, address, tokenProgram) {
  try {
    return await getAccount(connection, address, "confirmed", tokenProgram);
  } catch (_error) {
    return null;
  }
}

function sideSnapshots(pool) {
  return [
    {
      index: 0,
      mint: pool.token0Mint,
      vault: pool.token0Vault,
      tokenProgram: pool.token0Program,
      protocolFees: bnToBigInt(pool.protocolFeesToken0),
      fundFees: bnToBigInt(pool.fundFeesToken0),
    },
    {
      index: 1,
      mint: pool.token1Mint,
      vault: pool.token1Vault,
      tokenProgram: pool.token1Program,
      protocolFees: bnToBigInt(pool.protocolFeesToken1),
      fundFees: bnToBigInt(pool.fundFeesToken1),
    },
  ];
}

function expectedReceiver({ mint, treasury }) {
  if (sameKey(mint, treasury.mimMint)) {
    return {
      isMim: true,
      feeReceiver: treasury.activeMimVault,
      assetVault: null,
      assetTokenAccount: null,
    };
  }
  const assetVaults = deriveAssetVaults(
    treasury.programId,
    treasury.state,
    mint
  );
  return {
    isMim: false,
    feeReceiver: assetVaults.assetTokenAccount,
    assetVault: assetVaults.assetVault,
    assetTokenAccount: assetVaults.assetTokenAccount,
  };
}

async function ensureAssetVault({
  connection,
  manaProgram,
  admin,
  treasury,
  side,
}) {
  const receiver = expectedReceiver({ mint: side.mint, treasury });
  if (receiver.isMim) {
    return { ...receiver, ready: true, created: false };
  }

  const [assetVaultExists, tokenAccount] = await Promise.all([
    accountExists(connection, receiver.assetVault),
    loadTokenAccount(connection, receiver.assetTokenAccount, side.tokenProgram),
  ]);
  if (assetVaultExists && tokenAccount) {
    return { ...receiver, ready: true, created: false };
  }
  if (assetVaultExists !== Boolean(tokenAccount)) {
    throw new Error(
      `Partial asset vault state for mint ${side.mint.toString()}: assetVault=${assetVaultExists}, tokenAccount=${Boolean(
        tokenAccount
      )}`
    );
  }
  if (!CREATE_MISSING_VAULTS) {
    return { ...receiver, ready: false, created: false };
  }
  if (DRY_RUN) {
    console.log(
      `[dry-run] create asset vault mint=${side.mint.toString()} tokenAccount=${receiver.assetTokenAccount.toString()}`
    );
    return { ...receiver, ready: false, created: false };
  }

  const instruction = await manaProgram.methods
    .createAssetVault()
    .accounts({
      authority: admin.publicKey,
      treasuryState: treasury.state,
      treasuryAuthority: treasury.authority,
      assetMint: side.mint,
      assetVault: receiver.assetVault,
      assetTokenAccount: receiver.assetTokenAccount,
      assetTokenProgram: side.tokenProgram,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  const signature = await sendTransactionWithSimulation({
    connection,
    payer: admin,
    instructions: [instruction],
    label: `createAssetVault mint=${side.mint.toString()}`,
  });
  console.log(
    `created asset vault mint=${side.mint.toString()} tx=${signature}`
  );
  return { ...receiver, ready: true, created: true };
}

async function collectFees({
  cpProgram,
  poolAddress,
  pool,
  sides,
  receivers,
  feeKind,
  cpSwapAuthority,
  admin,
}) {
  const amount0 =
    feeKind === "protocol" ? sides[0].protocolFees : sides[0].fundFees;
  const amount1 =
    feeKind === "protocol" ? sides[1].protocolFees : sides[1].fundFees;
  if (amount0 === 0n && amount1 === 0n) {
    return null;
  }
  if (!receivers.every((receiver) => receiver.ready)) {
    console.log(
      `skip ${feeKind} sweep for ${poolAddress.toString()}: missing receiver`
    );
    return null;
  }

  const accounts = {
    authority: cpSwapAuthority,
    poolState: poolAddress,
    ammConfig: pool.ammConfig,
    token0Vault: pool.token0Vault,
    token1Vault: pool.token1Vault,
    vault0Mint: sides[0].mint,
    vault1Mint: sides[1].mint,
    recipientToken0Account: receivers[0].feeReceiver,
    recipientToken1Account: receivers[1].feeReceiver,
    tokenProgram: TOKEN_PROGRAM_ID,
    tokenProgram2022: TOKEN_2022_PROGRAM_ID,
  };
  if (DRY_RUN) {
    console.log(
      `[dry-run] sweep ${feeKind} pool=${poolAddress.toString()} amount0=${amount0} amount1=${amount1}`
    );
    return null;
  }

  const builder =
    feeKind === "protocol"
      ? cpProgram.methods.collectProtocolFee(
          new anchor.BN(amount0.toString()),
          new anchor.BN(amount1.toString())
        )
      : cpProgram.methods.collectFundFee(
          new anchor.BN(amount0.toString()),
          new anchor.BN(amount1.toString())
        );

  const instruction = await builder.accounts(accounts).instruction();
  const signature = await sendTransactionWithSimulation({
    connection: cpProgram.provider.connection,
    payer: admin,
    instructions: [instruction],
    label: `${feeKind} sweep pool=${poolAddress.toString()}`,
  });
  console.log(
    `swept ${feeKind} pool=${poolAddress.toString()} amount0=${amount0} amount1=${amount1} tx=${signature}`
  );
  return signature;
}

async function main() {
  if (!fs.existsSync(TREASURY_OUTPUT)) {
    throw new Error(
      `Missing ${TREASURY_OUTPUT}. Run npm run devnet:setup-treasury first.`
    );
  }
  if (!fs.existsSync(CP_SWAP_IDL) || !fs.existsSync(MANA_TREASURY_IDL)) {
    throw new Error("Missing target IDLs. Run anchor build first.");
  }

  const admin = readKeypair(ADMIN_KEYPAIR);
  const treasuryOutput = readJson(TREASURY_OUTPUT);
  const cpSwapProgramId = new PublicKey(
    process.env.CP_SWAP_PROGRAM || readJson(CP_SWAP_IDL).address
  );
  const manaProgramId = new PublicKey(treasuryOutput.manaTreasuryProgram);
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const cpProgram = new anchor.Program(
    loadIdl(CP_SWAP_IDL, cpSwapProgramId),
    provider
  );
  const manaProgram = new anchor.Program(
    loadIdl(MANA_TREASURY_IDL, manaProgramId),
    provider
  );
  const treasury = {
    programId: manaProgram.programId,
    state: new PublicKey(treasuryOutput.treasuryState),
    authority: deriveTreasuryAuthority(
      manaProgram.programId,
      new PublicKey(treasuryOutput.treasuryState)
    ),
    activeMimVault: deriveActiveMimVault(
      manaProgram.programId,
      new PublicKey(treasuryOutput.treasuryState)
    ),
    mimMint: new PublicKey(treasuryOutput.dmimMint),
  };
  if (
    !sameKey(
      treasury.authority,
      new PublicKey(treasuryOutput.treasuryAuthority)
    )
  ) {
    throw new Error("Derived treasury authority does not match devnet output.");
  }
  if (
    !sameKey(
      treasury.activeMimVault,
      new PublicKey(treasuryOutput.activeMimVault)
    )
  ) {
    throw new Error("Derived active MIM vault does not match devnet output.");
  }

  console.log(`RPC URL: ${RPC_URL}`);
  console.log(`Dry run: ${DRY_RUN ? "yes" : "no"}`);
  console.log(`Admin: ${admin.publicKey.toString()}`);
  console.log(`CP-swap program: ${cpProgram.programId.toString()}`);
  console.log(`Treasury state: ${treasury.state.toString()}`);

  const cpSwapAuthority = deriveCpSwapAuthority(cpProgram.programId);
  const poolAccounts = await cpProgram.account.poolState.all();
  let inspected = 0;
  let eligible = 0;
  let createdVaults = 0;
  let swept = 0;

  for (const poolAccount of poolAccounts) {
    inspected += 1;
    const poolAddress = poolAccount.publicKey;
    const pool = poolAccount.account;
    if (POOL_FILTER && !sameKey(poolAddress, POOL_FILTER)) {
      continue;
    }
    if (AMM_CONFIG_FILTER && !sameKey(pool.ammConfig, AMM_CONFIG_FILTER)) {
      continue;
    }

    const config = await cpProgram.account.ammConfig.fetch(pool.ammConfig);
    if (
      !sameKey(config.treasuryProgram, treasury.programId) ||
      !sameKey(config.treasuryState, treasury.state) ||
      !sameKey(config.mimMint, treasury.mimMint)
    ) {
      console.log(
        `skip pool=${poolAddress.toString()}: AMM config is not routed to configured treasury`
      );
      continue;
    }
    eligible += 1;

    const sides = sideSnapshots(pool);
    const receivers = [];
    for (const side of sides) {
      const receiver = await ensureAssetVault({
        connection,
        manaProgram,
        admin,
        treasury,
        side,
      });
      if (receiver.created) {
        createdVaults += 1;
      }
      receivers.push(receiver);
    }

    if (SWEEP_PROTOCOL) {
      const signature = await collectFees({
        cpProgram,
        poolAddress,
        pool,
        sides,
        receivers,
        feeKind: "protocol",
        cpSwapAuthority,
        admin,
      });
      if (signature) swept += 1;
    }
    if (SWEEP_FUND) {
      const signature = await collectFees({
        cpProgram,
        poolAddress,
        pool,
        sides,
        receivers,
        feeKind: "fund",
        cpSwapAuthority,
        admin,
      });
      if (signature) swept += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        inspectedPools: inspected,
        eligiblePools: eligible,
        createdVaults,
        sweepTransactions: swept,
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
