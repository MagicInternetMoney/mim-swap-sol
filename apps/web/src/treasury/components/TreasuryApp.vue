<template>
  <WalletProvider
    :wallets="wallets"
    :auto-connect="true"
    :on-error="handleWalletError"
  >
    <WalletModalProvider>
      <TreasuryShell :wallet-error-message="walletErrorMessage" />
    </WalletModalProvider>
  </WalletProvider>
</template>

<script setup lang="ts">
import { WalletProvider } from "@solana/wallet-adapter-vue";
import { WalletModalProvider } from "@solana/wallet-adapter-vue-ui";
import type { WalletError } from "@solana/wallet-adapter-base";
import { ref } from "vue";
import { createTreasuryWallets } from "../lib/wallets";
import TreasuryShell from "./TreasuryShell.vue";

const wallets = createTreasuryWallets();
const walletErrorMessage = ref("");

function handleWalletError(error: WalletError) {
  walletErrorMessage.value = walletErrorMessageFor(error);
  console.warn("Wallet error", error);
}

function walletErrorMessageFor(error: WalletError) {
  if (error.name === "WalletNotReadyError") {
    return "Phantom was selected, but the browser did not expose the Phantom wallet provider. Open this page in a browser with Phantom enabled and refresh.";
  }

  return error.message || error.name || "Wallet connection failed.";
}
</script>
