import type { Adapter, WalletName } from "@solana/wallet-adapter-base";
import {
  WalletAdapterNetwork,
  WalletReadyState,
} from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";

type LegacyReadyAdapter = Adapter & {
  ready(): Promise<boolean>;
  _readyState?: WalletReadyState;
};

export type DexWallet = {
  name: WalletName;
  url: string;
  icon: string;
  adapter: LegacyReadyAdapter;
};

type PhantomWindow = Window & {
  isPhantomInstalled?: boolean;
  phantom?: {
    solana?: {
      isPhantom?: boolean;
    };
  };
  solana?: {
    isPhantom?: boolean;
  };
};

export function createDexWallets(): DexWallet[] {
  return [
    createWalletDescriptor(new PhantomWalletAdapter()),
    createWalletDescriptor(
      new SolflareWalletAdapter({ network: WalletAdapterNetwork.Devnet }),
    ),
  ];
}

function createWalletDescriptor(adapter: Adapter): DexWallet {
  const compatibleAdapter = withLegacyReady(adapter);
  return {
    name: compatibleAdapter.name,
    url: compatibleAdapter.url,
    icon: compatibleAdapter.icon,
    adapter: compatibleAdapter,
  };
}

function withLegacyReady(adapter: Adapter): LegacyReadyAdapter {
  const compatibleAdapter = adapter as LegacyReadyAdapter;
  compatibleAdapter.ready = async () => {
    normalizeInjectedReadyState(compatibleAdapter);
    return (
      compatibleAdapter.readyState === WalletReadyState.Installed ||
      compatibleAdapter.readyState === WalletReadyState.Loadable
    );
  };
  return compatibleAdapter;
}

function normalizeInjectedReadyState(adapter: LegacyReadyAdapter) {
  if (adapter.name !== "Phantom" || typeof window === "undefined") {
    return;
  }

  const phantomWindow = window as PhantomWindow;
  const injectedProvider =
    phantomWindow.phantom?.solana?.isPhantom || phantomWindow.solana?.isPhantom;

  if (injectedProvider && adapter.readyState !== WalletReadyState.Installed) {
    adapter._readyState = WalletReadyState.Installed;
    adapter.emit("readyStateChange", WalletReadyState.Installed);
  }
}
