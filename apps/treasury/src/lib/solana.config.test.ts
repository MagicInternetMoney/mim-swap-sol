import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLUSTER,
  getClusterConfig,
  isDeployedConfig,
  parseClusterParam,
  SOLANA_CONFIG,
} from "./solana.config";
import {
  deriveAssetVaultPdas,
  deriveCpSwapAuthority,
  deriveMetadataPda,
  deriveTreasuryPdas,
} from "./pdas";

describe("solana config", () => {
  it("falls back to devnet for missing or invalid query params", () => {
    expect(parseClusterParam(null)).toBe(DEFAULT_CLUSTER);
    expect(parseClusterParam("localnet")).toBe(DEFAULT_CLUSTER);
    expect(parseClusterParam("mainnet")).toBe("mainnet");
  });

  it("keeps mainnet present but undeployed", () => {
    const mainnet = getClusterConfig("mainnet");
    expect(mainnet.deployed).toBe(false);
    expect(mainnet.treasury).toBeNull();
  });

  it("matches devnet treasury PDA derivations", () => {
    const devnet = SOLANA_CONFIG.devnet;
    expect(isDeployedConfig(devnet)).toBe(true);
    if (!isDeployedConfig(devnet)) {
      throw new Error("devnet must be deployed");
    }

    const pdas = deriveTreasuryPdas(
      new PublicKey(devnet.treasury.manaTreasuryProgram),
      new PublicKey(devnet.treasury.admin)
    );
    expect(pdas.treasuryState.toString()).toBe(devnet.treasury.treasuryState);
    expect(pdas.treasuryAuthority.toString()).toBe(
      devnet.treasury.treasuryAuthority
    );
    expect(pdas.manaMint.toString()).toBe(devnet.treasury.manaMint);
    expect(pdas.activeReserveVault.toString()).toBe(
      devnet.treasury.activeReserveVault
    );
    expect(pdas.pendingReserveVault.toString()).toBe(
      devnet.treasury.pendingReserveVault
    );
    expect(pdas.pendingManaVault.toString()).toBe(
      devnet.treasury.pendingManaVault
    );
  });

  it("matches configured metadata PDAs", () => {
    const devnet = SOLANA_CONFIG.devnet;
    if (!isDeployedConfig(devnet)) {
      throw new Error("devnet must be deployed");
    }

    const metadataProgram = new PublicKey(devnet.tokenPrograms.tokenMetadata);
    expect(
      deriveMetadataPda(
        metadataProgram,
        new PublicKey(devnet.treasury.manaMint)
      ).toString()
    ).toBe(devnet.treasury.manaMetadata);
    expect(
      deriveMetadataPda(
        metadataProgram,
        new PublicKey(devnet.treasury.reserveMint)
      ).toString()
    ).toBe(devnet.treasury.reserveMetadata);
  });

  it("derives treasury asset vaults for arbitrary fee mints", () => {
    const devnet = SOLANA_CONFIG.devnet;
    if (!isDeployedConfig(devnet)) {
      throw new Error("devnet must be deployed");
    }

    const feeMint = new PublicKey(
      "So11111111111111111111111111111111111111112"
    );
    const vaults = deriveAssetVaultPdas(
      new PublicKey(devnet.treasury.manaTreasuryProgram),
      new PublicKey(devnet.treasury.treasuryState),
      feeMint
    );

    expect(vaults.assetVault.toString()).not.toBe(
      devnet.treasury.activeReserveVault
    );
    expect(vaults.assetTokenAccount.toString()).not.toBe(
      devnet.treasury.activeReserveVault
    );
  });

  it("derives the configured CP-swap pool authority", () => {
    const devnet = SOLANA_CONFIG.devnet;
    if (!devnet.cpSwapProgram) {
      throw new Error("devnet CP-swap program must be configured");
    }

    expect(
      deriveCpSwapAuthority(new PublicKey(devnet.cpSwapProgram)).toString()
    ).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });
});
