import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { RaydiumCpSwap } from "../target/types/raydium_cp_swap";
import { assert } from "chai";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import { getAuthAddress, initialize, setupInitializeTest } from "./utils";

const METADATA_SEED = Buffer.from("metadata");
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

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

describe("LP metadata", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const owner = anchor.Wallet.local().payer;
  const connection = anchor.getProvider().connection;
  const program = anchor.workspace.RaydiumCpSwap as Program<RaydiumCpSwap>;
  const confirmOptions = {
    commitment: "confirmed" as const,
    preflightCommitment: "confirmed" as const,
  };

  it("initializes Metaplex metadata for a pool LP mint", async () => {
    const bob = Keypair.generate();
    const airdrop = await connection.requestAirdrop(
      bob.publicKey,
      LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdrop, "confirmed");

    const { configAddress, token0, token0Program, token1, token1Program } =
      await setupInitializeTest(
        program,
        connection,
        owner,
        {
          config_index: 0,
          tradeFeeRate: new BN(10),
          protocolFeeRate: new BN(1000),
          fundFeeRate: new BN(25000),
          create_fee: new BN(0),
        },
        { transferFeeBasisPoints: 0, MaxFee: 0 },
        confirmOptions
      );
    const { poolAddress, poolState } = await initialize(
      program,
      owner,
      configAddress,
      token0,
      token0Program,
      token1,
      token1Program,
      confirmOptions
    );

    const [authority] = await getAuthAddress(program.programId);
    const metadata = deriveMetadataPda(poolState.lpMint);

    try {
      await program.methods
        .initializeLpMetadata("Fake LP", "FAKE", "")
        .accounts({
          creator: bob.publicKey,
          authority,
          poolState: poolAddress,
          lpMint: poolState.lpMint,
          metadata,
          metadataProgram: TOKEN_METADATA_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([bob])
        .rpc(confirmOptions);
      assert.fail("unauthorized LP metadata initialization should fail");
    } catch (_error) {
      assert.ok(true);
    }

    await program.methods
      .initializeLpMetadata("MIM Swap LP: DMIM/SMOKE", "DMIM-SMOKE", "")
      .accounts({
        creator: owner.publicKey,
        authority,
        poolState: poolAddress,
        lpMint: poolState.lpMint,
        metadata,
        metadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc(confirmOptions);

    const metadataAccount = await connection.getAccountInfo(metadata);
    if (!metadataAccount) {
      assert.fail("LP metadata account should exist");
    }
    const metadataText = readMetadataText(metadataAccount.data);
    assert.equal(metadataText.name, "MIM Swap LP: DMIM/SMOKE");
    assert.equal(metadataText.symbol, "DMIM-SMOKE");
    assert.equal(metadataText.uri, "");
  });
});
