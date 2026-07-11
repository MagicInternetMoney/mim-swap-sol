import { describe, expect, it } from "vitest";
import {
  previewDeposit,
  previewWithdraw,
  quoteSwapBaseInput,
  tradingFee,
} from "./cp-swap-math";

describe("cp-swap math", () => {
  it("matches the 5% max fee and 20/80 split", () => {
    const quote = quoteSwapBaseInput({
      inputAmount: 1_000_000n,
      inputVaultAmount: 100_000_000n,
      outputVaultAmount: 100_000_000n,
      tradeFeeRate: 50_000,
      protocolFeeRate: 200_000,
      slippageBps: 100,
    });

    expect(quote.tradeFee).toBe(50_000n);
    expect(quote.protocolFee).toBe(10_000n);
    expect(quote.lpFee).toBe(40_000n);
    expect(quote.outputAmount).toBeGreaterThan(0n);
    expect(quote.minimumOutputAmount).toBeLessThan(quote.outputAmount);
  });

  it("uses ceiling trade fees like the program", () => {
    expect(tradingFee(1n, 2_500n)).toBe(1n);
  });

  it("previews deposit with ceiling token amounts", () => {
    const preview = previewDeposit({
      lpTokenAmount: 5n,
      lpSupply: 10n,
      token0VaultAmount: 101n,
      token1VaultAmount: 203n,
      slippageBps: 100,
    });

    expect(preview.token0Amount).toBe(51n);
    expect(preview.token1Amount).toBe(102n);
    expect(preview.maxToken0Amount).toBe(52n);
  });

  it("previews withdraw with floor token amounts", () => {
    const preview = previewWithdraw({
      lpTokenAmount: 5n,
      lpSupply: 10n,
      token0VaultAmount: 101n,
      token1VaultAmount: 203n,
      slippageBps: 100,
    });

    expect(preview.token0Amount).toBe(50n);
    expect(preview.token1Amount).toBe(101n);
    expect(preview.minToken0Amount).toBe(49n);
  });
});
