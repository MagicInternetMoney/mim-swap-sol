# Testing

This repo has two useful testing layers:

- A focused local integration test for the new Mana treasury vault.
- A focused local integration test for cp-swap LP token metadata.
- Lower-level Rust and Anchor checks for the programs.

## Prerequisites

Install the normal Solana and Anchor tooling for this repo:

- Anchor `0.32.1`
- Solana/Agave CLI compatible with the repo toolchain
- Yarn

The first JavaScript test run installs the repo's JS dependencies with `yarn install`.

## Mana Treasury Local Test

Run:

```bash
yarn test:mana-local
```

This is the main local sanity check for the MIM-backed Mana treasury. It:

- Builds `mana_treasury` with `--features local-testing` for the disposable local harness.
- Downloads the deployed Metaplex Token Metadata program to
  `target/deploy/metaplex_token_metadata.so` on first run if it is missing.
- Starts a clean local `solana-test-validator`.
- Loads `target/deploy/mana_treasury.so` at the configured local program id.
- Loads the Metaplex Token Metadata program so wallet-visible Mana metadata can be tested.
- Creates a temporary funded local wallet.
- Runs only `tests/mana_treasury.test.ts`.
- Stops the validator and deletes the temporary wallet when finished.

The test covers:

- First MIM deposit minting Mana 1:1.
- Admin-only Mana metadata initialization creating a Metaplex metadata PDA with
  `name = "Mana"` and `symbol = "MANA"`.
- MIM donation minting no Mana and raising NAV.
- Later MIM deposit minting less Mana after NAV increases.
- Mana transfer between wallets.
- De-stake escrow of Mana and immediate MIM reserve snapshot.
- Later donation not increasing a queued de-staker's reserved MIM.
- Finalize de-stake burning escrowed Mana and paying reserved MIM.
- Non-MIM asset vault donation staying outside Mana NAV.
- Unauthorized treasury config update failing.

If the first run cannot reach public RPC to dump the Metaplex program, provide a
local dump explicitly:

```bash
TOKEN_METADATA_PROGRAM_SO=/absolute/path/to/metaplex_token_metadata.so yarn test:mana-local
```

## CP-Swap LP Metadata Local Test

Run:

```bash
npm run test:lp-metadata-local
```

This starts a clean local validator with `raydium_cp_swap` and the Metaplex
Token Metadata program loaded. It creates a CP-swap pool, verifies a non-creator
cannot initialize LP metadata, then creates a Metaplex metadata PDA for the LP
mint with:

```text
name = "MIM Swap LP: DMIM/SMOKE"
symbol = "DMIM-SMOKE"
uri = ""
```

If the first run cannot reach public RPC to dump the Metaplex program, reuse the
same override supported by the Mana test:

```bash
TOKEN_METADATA_PROGRAM_SO=/absolute/path/to/metaplex_token_metadata.so npm run test:lp-metadata-local
```

### Port Conflicts

The script uses local RPC port `8899` by default. If that port is busy, choose another port:

```bash
MANA_TEST_RPC_PORT=8900 yarn test:mana-local
```

Validator logs are written to:

```text
.anchor/mana-test-validator.log
```

The local ledger is written to:

```text
.anchor/mana-test-ledger
```

The script starts the validator with `--reset`, so the ledger is recreated each run.

## Why `local-testing` Exists

Deployable builds no longer hardcode the reserve mint. `initialize_treasury`
accepts the chosen SPL mint and stores it as the treasury reserve mint, so:

- Devnet can create and pass any disposable SPL test-MIM mint.
- Mainnet should pass the real MIM mint: `89BZ5RU212yKr3iFdJHyn3ZsR37bS4s8TbmVb2yApump`.

The treasury state PDA is also seeded by the initial authority:

```text
[b"treasury", authority]
```

That means your deploy/admin wallet owns its treasury namespace, and another wallet
cannot initialize the same canonical treasury address before you. Changing treasury
authority later does not change the PDA address.

Local tests still use the `local-testing` feature for the disposable local test
harness. Do not deploy a `local-testing` build.

For deployable builds, use the default feature set:

```bash
anchor build
```

## Rust Unit Tests

Run the treasury math/accounting unit tests:

```bash
cargo test -p mana-treasury --lib
```

Run the same treasury unit tests with the local-testing feature enabled:

```bash
cargo test -p mana-treasury --lib --features local-testing
```

Run the existing AMM unit tests:

```bash
cargo test -p raydium-cp-swap --lib
```

## Build Check

Run:

```bash
anchor build
```

This builds both Anchor programs and regenerates IDL/types in `target/`.

## Devnet Treasury Setup

After deploying `mana_treasury` to devnet, initialize the test treasury with:

```bash
npm run devnet:setup-treasury
```

By default this uses `target/deploy/mim_admin-keypair.json`, creates a standard
SPL DMIM mint with 6 decimals, mints `1,000,000,000` DMIM to the admin ATA,
creates Metaplex metadata for DMIM, initializes the treasury with DMIM as the
reserve mint, creates Metaplex metadata for Mana, and sets the devnet cooldown
to `30` seconds.

Useful overrides:

```bash
RPC_URL=https://api.devnet.solana.com \
ADMIN_KEYPAIR=target/deploy/mim_admin-keypair.json \
DMIM_METADATA_URI="" \
MANA_METADATA_URI="" \
DEVNET_COOLDOWN_SECONDS=30 \
npm run devnet:setup-treasury
```

The script writes the resulting addresses to
`target/deploy/devnet-treasury.json`.

## Full Anchor Test Caveat

The default `Anchor.toml` test config includes Raydium-style mainnet account clones. That is useful for AMM tests, but it makes a simple Mana-only test more fragile because the local validator has to fetch cloned accounts from mainnet.

For the Mana treasury vault, prefer:

```bash
yarn test:mana-local
```

It starts a minimal local validator with only the Mana program loaded, so the test does not depend on mainnet clones.
