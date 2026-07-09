import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import {
  ConfirmOptions,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAccount,
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { ManaTreasury } from "../target/types/mana_treasury";
import { RaydiumCpSwap } from "../target/types/raydium_cp_swap";
import {
  createAmmConfig,
  getAuthAddress,
  initialize,
  sendTransaction,
  swap_base_input,
  swap_base_output,
} from "./utils";

const TREASURY_SEED = Buffer.from("treasury");
const TREASURY_AUTHORITY_SEED = Buffer.from("treasury_authority");
const MANA_MINT_SEED = Buffer.from("mana_mint");
const ACTIVE_MIM_VAULT_SEED = Buffer.from("active_mim_vault");
const PENDING_MIM_VAULT_SEED = Buffer.from("pending_mim_vault");
const PENDING_MANA_VAULT_SEED = Buffer.from("pending_mana_vault");
const ASSET_VAULT_SEED = Buffer.from("asset_vault");
const ASSET_TOKEN_VAULT_SEED = Buffer.from("asset_token_vault");

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

function comparePubkeys(a: PublicKey, b: PublicKey) {
  return Buffer.compare(a.toBuffer(), b.toBuffer());
}

function readKeypair(keypairPath: string) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8")))
  );
}

function readCreatePoolFeeReceiver() {
  const source = fs.readFileSync(
    path.join(process.cwd(), "programs/cp-swap/src/lib.rs"),
    "utf8"
  );
  const match = source.match(
    /pub mod create_pool_fee_reveiver \{[\s\S]*?pub const ID: Pubkey = pubkey!\("([^"]+)"\);/
  );
  if (!match) {
    throw new Error("Unable to read create_pool_fee_reveiver ID from cp-swap");
  }
  return new PublicKey(match[1]);
}

async function ensureCreatePoolFeeReceiver(
  connection: anchor.web3.Connection,
  payer: Keypair,
  receiver: Keypair
) {
  try {
    await getAccount(
      connection,
      receiver.publicKey,
      "processed",
      TOKEN_PROGRAM_ID
    );
  } catch (_err) {
    await createAccount(
      connection,
      payer,
      NATIVE_MINT,
      payer.publicKey,
      receiver,
      undefined,
      TOKEN_PROGRAM_ID
    );
  }
}

async function expectTransactionFailure(action: () => Promise<unknown>) {
  try {
    await action();
    assert.fail("transaction should have failed");
  } catch (_err) {
    assert.ok(true);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("permissionless treasury fee sweeps", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider();
  const connection = provider.connection;
  const authority = anchor.Wallet.local().payer;
  const manaProgram = anchor.workspace.ManaTreasury as Program<ManaTreasury>;
  const cpProgram = anchor.workspace.RaydiumCpSwap as Program<RaydiumCpSwap>;
  const confirmOptions: ConfirmOptions = {
    skipPreflight: true,
    commitment: "confirmed",
  };

  it("lets any payer sweep protocol and fund fees only to canonical treasury vaults", async () => {
    const createPoolFeeReceiver = readKeypair(
      path.join(
        process.cwd(),
        "target/deploy/create_pool_fee_receiver-keypair.json"
      )
    );
    assert.isTrue(
      createPoolFeeReceiver.publicKey.equals(readCreatePoolFeeReceiver()),
      "create-pool fee receiver keypair must match cp-swap source constant"
    );
    await ensureCreatePoolFeeReceiver(
      connection,
      authority,
      createPoolFeeReceiver
    );

    const sweeper = Keypair.generate();
    const airdropSig = await connection.requestAirdrop(
      sweeper.publicKey,
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
      100_000_000n
    );
    await mintTo(
      connection,
      authority,
      assetMint,
      authorityAsset.address,
      authority,
      100_000_000n
    );

    const treasuryPdas = deriveTreasuryPdas(
      manaProgram.programId,
      authority.publicKey
    );
    await manaProgram.methods
      .initializeTreasury()
      .accounts({
        authority: authority.publicKey,
        treasuryState: treasuryPdas.treasuryState,
        treasuryAuthority: treasuryPdas.treasuryAuthority,
        mimMint,
        manaMint: treasuryPdas.manaMint,
        activeMimVault: treasuryPdas.activeMimVault,
        pendingMimVault: treasuryPdas.pendingMimVault,
        pendingManaVault: treasuryPdas.pendingManaVault,
        mimTokenProgram: TOKEN_PROGRAM_ID,
        manaTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc(confirmOptions);

    const configAddress = await createAmmConfig(
      cpProgram,
      connection,
      authority,
      1234,
      new BN(100_000),
      new BN(500_000),
      new BN(500_000),
      new BN(0),
      new BN(0),
      manaProgram.programId,
      treasuryPdas.treasuryState,
      mimMint,
      confirmOptions
    );

    const [token0, token1] = [
      { mint: mimMint, program: TOKEN_PROGRAM_ID },
      { mint: assetMint, program: TOKEN_PROGRAM_ID },
    ].sort((a, b) => comparePubkeys(a.mint, b.mint));

    const { poolAddress, poolState } = await initialize(
      cpProgram,
      authority,
      configAddress,
      token0.mint,
      token0.program,
      token1.mint,
      token1.program,
      confirmOptions,
      { initAmount0: new BN(10_000_000), initAmount1: new BN(10_000_000) },
      createPoolFeeReceiver.publicKey
    );

    await sleep(1000);
    await swap_base_input(
      cpProgram,
      authority,
      configAddress,
      token0.mint,
      token0.program,
      token1.mint,
      token1.program,
      new BN(1_000_000),
      new BN(0),
      confirmOptions
    );
    await swap_base_output(
      cpProgram,
      authority,
      configAddress,
      token1.mint,
      token1.program,
      token0.mint,
      token0.program,
      new BN(500_000),
      new BN(10_000_000),
      confirmOptions,
      poolAddress
    );

    const feeState = await cpProgram.account.poolState.fetch(poolAddress);
    const protocol0 = BigInt(feeState.protocolFeesToken0.toString());
    const protocol1 = BigInt(feeState.protocolFeesToken1.toString());
    const fund0 = BigInt(feeState.fundFeesToken0.toString());
    const fund1 = BigInt(feeState.fundFeesToken1.toString());
    assert.isTrue(protocol0 > 0n && protocol1 > 0n);
    assert.isTrue(fund0 > 0n && fund1 > 0n);

    const assetVaults = deriveAssetVaults(
      manaProgram.programId,
      treasuryPdas.treasuryState,
      assetMint
    );
    const recipient0 = token0.mint.equals(mimMint)
      ? treasuryPdas.activeMimVault
      : assetVaults.assetTokenAccount;
    const recipient1 = token1.mint.equals(mimMint)
      ? treasuryPdas.activeMimVault
      : assetVaults.assetTokenAccount;
    const [poolAuthority] = await getAuthAddress(cpProgram.programId);
    const collectAccounts = {
      authority: poolAuthority,
      poolState: poolAddress,
      ammConfig: configAddress,
      token0Vault: poolState.token0Vault,
      token1Vault: poolState.token1Vault,
      vault0Mint: token0.mint,
      vault1Mint: token1.mint,
      recipientToken0Account: recipient0,
      recipientToken1Account: recipient1,
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram2022: TOKEN_2022_PROGRAM_ID,
    };

    await expectTransactionFailure(async () => {
      const ix = await cpProgram.methods
        .collectProtocolFee(
          feeState.protocolFeesToken0,
          feeState.protocolFeesToken1
        )
        .accounts(collectAccounts)
        .instruction();
      await sendTransaction(connection, [ix], [sweeper], confirmOptions);
    });

    await manaProgram.methods
      .createAssetVault()
      .accounts({
        authority: authority.publicKey,
        treasuryState: treasuryPdas.treasuryState,
        treasuryAuthority: treasuryPdas.treasuryAuthority,
        assetMint,
        assetVault: assetVaults.assetVault,
        assetTokenAccount: assetVaults.assetTokenAccount,
        assetTokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc(confirmOptions);

    const nonCanonicalMim = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      mimMint,
      treasuryPdas.treasuryAuthority,
      true,
      "processed",
      confirmOptions,
      TOKEN_PROGRAM_ID
    );
    await expectTransactionFailure(async () => {
      const ix = await cpProgram.methods
        .collectProtocolFee(
          feeState.protocolFeesToken0,
          feeState.protocolFeesToken1
        )
        .accounts({
          ...collectAccounts,
          recipientToken0Account: token0.mint.equals(mimMint)
            ? nonCanonicalMim.address
            : recipient0,
          recipientToken1Account: token1.mint.equals(mimMint)
            ? nonCanonicalMim.address
            : recipient1,
        })
        .instruction();
      await sendTransaction(connection, [ix], [sweeper], confirmOptions);
    });

    const activeMimBefore = (
      await getAccount(connection, treasuryPdas.activeMimVault)
    ).amount;
    const assetBefore = (
      await getAccount(connection, assetVaults.assetTokenAccount)
    ).amount;
    const expectedMimIncrease = token0.mint.equals(mimMint)
      ? protocol0 + fund0
      : protocol1 + fund1;
    const expectedAssetIncrease = token0.mint.equals(assetMint)
      ? protocol0 + fund0
      : protocol1 + fund1;

    const protocolIx = await cpProgram.methods
      .collectProtocolFee(
        feeState.protocolFeesToken0,
        feeState.protocolFeesToken1
      )
      .accounts(collectAccounts)
      .instruction();
    await sendTransaction(connection, [protocolIx], [sweeper], confirmOptions);

    const fundIx = await cpProgram.methods
      .collectFundFee(feeState.fundFeesToken0, feeState.fundFeesToken1)
      .accounts(collectAccounts)
      .instruction();
    await sendTransaction(connection, [fundIx], [sweeper], confirmOptions);

    const finalPoolState = await cpProgram.account.poolState.fetch(poolAddress);
    assert.equal(finalPoolState.protocolFeesToken0.toString(), "0");
    assert.equal(finalPoolState.protocolFeesToken1.toString(), "0");
    assert.equal(finalPoolState.fundFeesToken0.toString(), "0");
    assert.equal(finalPoolState.fundFeesToken1.toString(), "0");
    assert.equal(
      (
        (await getAccount(connection, treasuryPdas.activeMimVault)).amount -
        activeMimBefore
      ).toString(),
      expectedMimIncrease.toString()
    );
    assert.equal(
      (
        (await getAccount(connection, assetVaults.assetTokenAccount)).amount -
        assetBefore
      ).toString(),
      expectedAssetIncrease.toString()
    );

    await expectTransactionFailure(async () => {
      const ix = await cpProgram.methods
        .collectProtocolFee(new BN(1), new BN(1))
        .accounts(collectAccounts)
        .instruction();
      await sendTransaction(connection, [ix], [sweeper], confirmOptions);
    });
  });
});
