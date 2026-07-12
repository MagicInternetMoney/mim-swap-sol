import { describe, expect, it } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { getClusterConfig, isDeployedConfig } from "./solana.config";
import {
  buildDepositTransaction,
  buildCreateAssetVaultTransaction,
  buildDonateReserveTransaction,
  buildFinalizeDestakeTransaction,
  buildSetCooldownSecondsTransaction,
  buildSetSwapRouterTransaction,
  buildStartDestakeTransaction,
  createDepositPreview,
  createDestakePreview,
  isTreasuryAuthorityWallet,
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

function token2022ReserveConfig() {
  const config = getClusterConfig("devnet");
  if (!isDeployedConfig(config)) {
    throw new Error("devnet must be deployed");
  }

  return {
    ...config,
    treasury: {
      ...config.treasury,
      reserveTokenProgram: TOKEN_2022_PROGRAM_ID.toString(),
    },
  };
}

function transactionAccountKeys(transaction: {
  instructions: Array<{ keys: Array<{ pubkey: PublicKey }> }>;
}) {
  return transaction.instructions.flatMap((instruction) =>
    instruction.keys.map((account) => account.pubkey.toString())
  );
}

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

describe("Token-2022 reserve transactions", () => {
  it("uses the configured reserve token program without changing Mana to Token-2022", async () => {
    const config = token2022ReserveConfig();
    const connection = new Connection(config.rpcUrl);
    const owner = new PublicKey(config.treasury.admin);
    const reserveMint = new PublicKey(config.treasury.reserveMint);
    const manaMint = new PublicKey(config.treasury.manaMint);
    const reserveAta = getAssociatedTokenAddressSync(
      reserveMint,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const classicReserveAta = getAssociatedTokenAddressSync(
      reserveMint,
      owner,
      false,
      TOKEN_PROGRAM_ID
    );
    const manaAta = getAssociatedTokenAddressSync(
      manaMint,
      owner,
      false,
      TOKEN_PROGRAM_ID
    );

    expect(reserveAta.toString()).not.toBe(classicReserveAta.toString());

    const deposit = await buildDepositTransaction(
      connection,
      config,
      owner,
      1_000n,
      990n
    );
    const donate = await buildDonateReserveTransaction(
      connection,
      config,
      owner,
      1_000n
    );
    const startDestake = await buildStartDestakeTransaction(
      connection,
      config,
      owner,
      1_000n,
      990n
    );
    const finalizeDestake = await buildFinalizeDestakeTransaction(
      connection,
      config,
      owner
    );

    for (const transaction of [
      deposit,
      donate,
      startDestake,
      finalizeDestake,
    ]) {
      expect(transactionAccountKeys(transaction)).toContain(
        TOKEN_2022_PROGRAM_ID.toString()
      );
    }

    expect(transactionAccountKeys(deposit)).toEqual(
      expect.arrayContaining([
        reserveAta.toString(),
        manaAta.toString(),
        TOKEN_PROGRAM_ID.toString(),
      ])
    );
    expect(transactionAccountKeys(donate)).toContain(reserveAta.toString());
    expect(transactionAccountKeys(startDestake)).toContain(
      TOKEN_PROGRAM_ID.toString()
    );
    expect(transactionAccountKeys(finalizeDestake)).toEqual(
      expect.arrayContaining([
        reserveAta.toString(),
        TOKEN_PROGRAM_ID.toString(),
      ])
    );
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

describe("admin helpers", () => {
  it("uses on-chain treasury authority for admin visibility", () => {
    const authority = new PublicKey(
      "G5mgpU51BzRyG5u294aVnecaxhW121iig4Eg3wXPAVda"
    );
    const nonAuthority = new PublicKey("11111111111111111111111111111111");
    const adminSnapshot: TreasurySnapshot = {
      ...snapshot,
      treasuryState: {
        ...snapshot.treasuryState,
        authority: authority.toString(),
      },
    };

    expect(isTreasuryAuthorityWallet(adminSnapshot, authority)).toBe(true);
    expect(isTreasuryAuthorityWallet(adminSnapshot, nonAuthority)).toBe(false);
    expect(isTreasuryAuthorityWallet(null, authority)).toBe(false);
  });

  it("builds treasury authority admin transactions", async () => {
    const config = getClusterConfig("devnet");
    if (!isDeployedConfig(config) || !config.cpSwapProgram) {
      throw new Error("devnet must be deployed with CP-swap configured");
    }
    const connection = new Connection(config.rpcUrl);
    const authority = new PublicKey(config.treasury.admin);
    const router = new PublicKey(config.cpSwapProgram);

    const setRouter = await buildSetSwapRouterTransaction(
      connection,
      config,
      authority,
      router
    );
    const setCooldown = await buildSetCooldownSecondsTransaction(
      connection,
      config,
      authority,
      30n
    );
    const createVault = await buildCreateAssetVaultTransaction(
      connection,
      config,
      authority,
      new PublicKey("So11111111111111111111111111111111111111112"),
      TOKEN_PROGRAM_ID
    );

    for (const transaction of [setRouter, setCooldown, createVault]) {
      expect(transaction.instructions).toHaveLength(1);
      expect(transaction.instructions[0].programId.toString()).toBe(
        config.treasury.manaTreasuryProgram
      );
      expect(
        transaction.instructions[0].keys.some(
          (account) => account.pubkey.equals(authority) && account.isSigner
        )
      ).toBe(true);
    }
  });
});
