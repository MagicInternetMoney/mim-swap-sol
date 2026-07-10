import { describe, expect, it } from "vitest";
import {
  applySlippageDown,
  calculateDepositManaOut,
  calculateRedeemReserveOut,
  formatRatio,
  formatTokenAmount,
  parseUiAmount,
} from "./amounts";

describe("amount helpers", () => {
  it("parses UI amounts with mint decimals", () => {
    expect(parseUiAmount("12.3456", 6)).toBe(12_345_600n);
    expect(() => parseUiAmount("1.123", 2)).toThrow(/at most 2/);
  });

  it("formats token amounts and ratios", () => {
    expect(formatTokenAmount(12_345_600n, 6)).toBe("12.3456");
    expect(formatTokenAmount(1_000_000_000n, 6)).toBe("1,000");
    expect(formatRatio(12_000n, 10_000n)).toBe("1.2000");
    expect(formatRatio(0n, 0n)).toBe("1.0000");
  });

  it("matches treasury deposit and redemption math", () => {
    expect(calculateDepositManaOut(1_000n, 0n, 0n)).toBe(1_000n);
    expect(calculateDepositManaOut(1_000n, 12_000n, 10_000n)).toBe(833n);
    expect(calculateRedeemReserveOut(1_000n, 12_000n, 10_000n)).toBe(1_200n);
  });

  it("applies slippage down in basis points", () => {
    expect(applySlippageDown(1_000n, 100)).toBe(990n);
  });
});
