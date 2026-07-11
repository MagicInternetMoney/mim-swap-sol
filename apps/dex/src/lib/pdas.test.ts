import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { SOLANA_CONFIG } from "./config";
import { derivePoolPdas, sortMintPair } from "./pdas";

describe("cp-swap pdas", () => {
  it("sorts mints by public key bytes", () => {
    const a = new PublicKey("11111111111111111111111111111112");
    const b = new PublicKey("11111111111111111111111111111113");

    const sorted = sortMintPair(b, a);
    expect(sorted.token0Mint.toString()).toBe(a.toString());
    expect(sorted.token1Mint.toString()).toBe(b.toString());
    expect(sorted.inputWasToken0).toBe(false);
  });

  it("derives the deployed smoke pool", () => {
    const config = SOLANA_CONFIG.devnet;
    const pdas = derivePoolPdas(
      new PublicKey(config.cpSwapProgram),
      new PublicKey(config.ammConfig),
      new PublicKey("FBzs4xf4WrtbhUudP6r1pJy9mSxHD6dbqPwKnD5GsZHy"),
      new PublicKey("6martsHjsobTNqPgNEmGs9hzGom7bqGQZoasMhz2P55C"),
    );

    expect(pdas.poolState.toString()).toBe(
      "2DvuwYkXAqZSGVni6MFrVJuVB7fSZDaDrzH5iUpmVEAm",
    );
  });
});
