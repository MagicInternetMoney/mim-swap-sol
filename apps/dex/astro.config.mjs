import { defineConfig } from "astro/config";
import vue from "@astrojs/vue";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  integrations: [vue()],
  vite: {
    plugins: [
      tailwindcss(),
      nodePolyfills({
        globals: {
          Buffer: true,
          process: true,
        },
      }),
    ],
    define: {
      "process.env": {},
    },
    optimizeDeps: {
      include: ["@coral-xyz/anchor", "@solana/spl-token", "@solana/web3.js"],
    },
  },
});
