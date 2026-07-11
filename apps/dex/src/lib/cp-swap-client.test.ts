import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { describe, expect, it } from "vitest";
import { SOLANA_CONFIG } from "./config";
import {
  buildInitializePoolAccounts,
  filterPoolsByPair,
  selectBestPoolForSwap,
  sortedTokenAmounts,
  type InitializePoolInput,
  type PoolSnapshot,
} from "./cp-swap-client";

const dmim = new PublicKey("FBzs4xf4WrtbhUudP6r1pJy9mSxHD6dbqPwKnD5GsZHy");
const smoke = new PublicKey("6martsHjsobTNqPgNEmGs9hzGom7bqGQZoasMhz2P55C");
const owner = new PublicKey("G5mgpU51BzRyG5u294aVnecaxhW121iig4Eg3wXPAVda");

describe("cp-swap client helpers", () => {
  it("builds initialize accounts for the deployed smoke pair", () => {
    const input: InitializePoolInput = {
      tokenAMint: dmim,
      tokenAProgram: TOKEN_PROGRAM_ID,
      tokenBMint: smoke,
      tokenBProgram: TOKEN_PROGRAM_ID,
      tokenAAmount: 100n,
      tokenBAmount: 200n,
      poolTradeFeeRate: 50_000,
    };

    const accounts = buildInitializePoolAccounts(
      SOLANA_CONFIG.devnet,
      owner,
      input,
    );
    expect(accounts.poolState.toString()).toBe(
      "2DvuwYkXAqZSGVni6MFrVJuVB7fSZDaDrzH5iUpmVEAm",
    );
    expect(accounts.createPoolFee.toString()).toBe(
      SOLANA_CONFIG.devnet.createPoolFeeReceiver,
    );
    expect(sortedTokenAmounts(input).token0Amount).toBe(200n);
    expect(sortedTokenAmounts(input).token1Amount).toBe(100n);
  });

  it("filters pools and picks the best direct output", () => {
    const lower = pool("pool-a", 100_000_000n, 100_000_000n);
    const deeper = pool("pool-b", 500_000_000n, 500_000_000n);

    expect(
      filterPoolsByPair([lower], dmim.toString(), smoke.toString()),
    ).toHaveLength(1);
    const best = selectBestPoolForSwap(
      [lower, deeper],
      smoke.toString(),
      dmim.toString(),
      1_000_000n,
      100,
    );

    expect(best?.pool.address).toBe("pool-b");
    expect(best?.quote.outputAmount).toBeGreaterThan(0n);
  });
});

function pool(
  address: string,
  token0Available: bigint,
  token1Available: bigint,
): PoolSnapshot {
  return {
    address,
    ammConfig: SOLANA_CONFIG.devnet.ammConfig,
    authority: "authority",
    lpMint: "lp",
    observationKey: "observation",
    poolCreator: owner.toString(),
    status: 0,
    openTime: 0,
    isOpen: true,
    canDeposit: true,
    canWithdraw: true,
    canSwap: true,
    lpSupply: 1_000_000_000n,
    poolTradeFeeRate: 2_500,
    sides: [
      {
        index: 0,
        mint: smoke.toString(),
        tokenProgram: TOKEN_PROGRAM_ID.toString(),
        decimals: 6,
        symbol: "SMOKE",
        name: "Smoke",
        vault: "vault0",
        vaultAmount: token0Available,
        availableAmount: token0Available,
        protocolFees: 0n,
        fundFees: 0n,
        creatorFees: 0n,
      },
      {
        index: 1,
        mint: dmim.toString(),
        tokenProgram: TOKEN_PROGRAM_ID.toString(),
        decimals: 6,
        symbol: "DMIM",
        name: "Dev MIM",
        vault: "vault1",
        vaultAmount: token1Available,
        availableAmount: token1Available,
        protocolFees: 0n,
        fundFees: 0n,
        creatorFees: 0n,
      },
    ],
  };
}
