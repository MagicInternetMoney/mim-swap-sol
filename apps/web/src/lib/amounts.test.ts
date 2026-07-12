import { describe, expect, it } from "vitest";
import {
  applySlippageDown,
  applySlippageUp,
  formatTokenAmount,
  parseUiAmount,
  poolFeeRateToPercent,
  validatePoolFeeRate,
} from "./amounts";

describe("amount helpers", () => {
  it("parses and formats token amounts", () => {
    expect(parseUiAmount("1.2345", 6)).toBe(1_234_500n);
    expect(formatTokenAmount(1_234_500n, 6, 4)).toBe("1.2345");
  });

  it("rejects invalid precision and zero amounts", () => {
    expect(() => parseUiAmount("0", 6)).toThrow("greater than zero");
    expect(() => parseUiAmount("1.1234567", 6)).toThrow("at most 6");
  });

  it("applies slippage in both directions", () => {
    expect(applySlippageDown(1_000_000n, 100)).toBe(990_000n);
    expect(applySlippageUp(1_000_000n, 100)).toBe(1_010_000n);
  });

  it("validates pool fee boundaries", () => {
    expect(() => validatePoolFeeRate(0)).toThrow("at most 5%");
    expect(() => validatePoolFeeRate(50_001)).toThrow("at most 5%");
    expect(() => validatePoolFeeRate(50_000)).not.toThrow();
    expect(poolFeeRateToPercent(50_000)).toBe("5.00%");
  });
});
