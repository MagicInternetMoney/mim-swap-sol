<template>
  <WalletProvider
    :wallets="wallets"
    :auto-connect="true"
    :on-error="handleWalletError"
  >
    <WalletModalProvider>
      <MimShell :wallet-error-message="walletErrorMessage" />
    </WalletModalProvider>
  </WalletProvider>
</template>

<script setup lang="ts">
import { WalletProvider } from "@solana/wallet-adapter-vue";
import { WalletModalProvider } from "@solana/wallet-adapter-vue-ui";
import type { WalletError } from "@solana/wallet-adapter-base";
import { ref } from "vue";
import { createMimWallets } from "../lib/wallets";
import MimShell from "./MimShell.vue";

const wallets = createMimWallets();
const walletErrorMessage = ref("");

function handleWalletError(error: WalletError) {
  walletErrorMessage.value = walletErrorMessageFor(error);
  console.warn("Wallet error", error);
}

function walletErrorMessageFor(error: WalletError) {
  if (error.name === "WalletNotReadyError") {
    return "Selected wallet is not available in this browser.";
  }
  return error.message || error.name || "Wallet connection failed.";
}
</script>
