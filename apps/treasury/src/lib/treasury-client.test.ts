import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { getClusterConfig } from "./solana.config";
import {
  createDepositPreview,
  createDestakePreview,
  resolveTransactionFeedTarget,
  type TreasurySnapshot,
} from "./treasury-client";

const snapshot: TreasurySnapshot = {
  treasuryState: {
    authority: "authority",
    pendingAuthority: "11111111111111111111111111111111",
    reserveMint: "reserve",
    manaMint: "mana",
    activeReserveVault: "active",
    pendingReserveVault: "pending-reserve",
    pendingManaVault: "pending-mana",
    cooldownSeconds: 30,
    swapRouter: "11111111111111111111111111111111",
    pendingManaSupply: 0n,
  },
  reserveMint: {
    address: "reserve",
    decimals: 6,
    supply: 1_000_000n,
  },
  manaMint: {
    address: "mana",
    decimals: 6,
    supply: 10_000n,
  },
  activeReserveVault: {
    address: "active",
    amount: 12_000n,
  },
  pendingReserveVault: {
    address: "pending-reserve",
    amount: 0n,
  },
  pendingManaVault: {
    address: "pending-mana",
    amount: 0n,
  },
  activeManaSupply: 10_000n,
  validationErrors: [],
};

describe("treasury previews", () => {
  it("previews NAV-priced deposits with slippage", () => {
    const preview = createDepositPreview(1_000n, snapshot, 100);
    expect(preview.estimatedOut).toBe(833n);
    expect(preview.minOut).toBe(824n);
  });

  it("previews NAV-priced destake requests with slippage", () => {
    const preview = createDestakePreview(1_000n, snapshot, 100);
    expect(preview.estimatedOut).toBe(1_200n);
    expect(preview.minOut).toBe(1_188n);
  });
});

describe("transaction feed target selection", () => {
  it("uses the treasury state for the treasury feed", () => {
    const config = getClusterConfig("devnet");
    const target = resolveTransactionFeedTarget(config, "treasury");

    expect(target).toEqual({
      address: config.treasury?.treasuryState,
      unavailableReason: "",
    });
  });

  it("uses the program id for the program feed", () => {
    const config = getClusterConfig("devnet");
    const target = resolveTransactionFeedTarget(config, "program");

    expect(target).toEqual({
      address: config.treasury?.manaTreasuryProgram,
      unavailableReason: "",
    });
  });

  it("requires a connected wallet for the wallet feed", () => {
    const config = getClusterConfig("devnet");
    const wallet = new PublicKey("11111111111111111111111111111111");

    expect(resolveTransactionFeedTarget(config, "wallet")).toEqual({
      address: null,
      unavailableReason: "Connect a wallet to view wallet transactions.",
    });
    expect(resolveTransactionFeedTarget(config, "wallet", wallet)).toEqual({
      address: wallet.toString(),
      unavailableReason: "",
    });
  });

  it("returns unavailable state for undeployed mainnet treasury feeds", () => {
    const config = getClusterConfig("mainnet");

    expect(resolveTransactionFeedTarget(config, "treasury")).toEqual({
      address: null,
      unavailableReason: "Treasury is not deployed on this cluster.",
    });
    expect(resolveTransactionFeedTarget(config, "program")).toEqual({
      address: null,
      unavailableReason: "Treasury is not deployed on this cluster.",
    });
  });
});
