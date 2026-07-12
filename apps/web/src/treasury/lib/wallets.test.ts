import { describe, expect, it } from "vitest";
import { createTreasuryWallets } from "./wallets";

describe("createTreasuryWallets", () => {
  it("wraps adapters as wallet descriptors expected by the Vue provider", async () => {
    const wallets = createTreasuryWallets();

    expect(wallets.map((wallet) => wallet.name)).toEqual(["Phantom", "Solflare"]);
    for (const wallet of wallets) {
      expect(wallet.adapter).toBeTruthy();
      expect(wallet.adapter.name).toBe(wallet.name);
      expect(wallet.adapter.icon).toBe(wallet.icon);
      expect(wallet.adapter.url).toBe(wallet.url);
      expect(typeof wallet.adapter.ready).toBe("function");
      await expect(wallet.adapter.ready()).resolves.toEqual(expect.any(Boolean));
    }
  });
});
