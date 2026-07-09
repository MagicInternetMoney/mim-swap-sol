# Testing

This repo has two useful testing layers:

- A focused local integration test for the new Mana treasury vault.
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
- Starts a clean local `solana-test-validator`.
- Loads `target/deploy/mana_treasury.so` at the configured local program id.
- Creates a temporary funded local wallet.
- Runs only `tests/mana_treasury.test.ts`.
- Stops the validator and deletes the temporary wallet when finished.

The test covers:

- First MIM deposit minting Mana 1:1.
- MIM donation minting no Mana and raising NAV.
- Later MIM deposit minting less Mana after NAV increases.
- Mana transfer between wallets.
- De-stake escrow of Mana and immediate MIM reserve snapshot.
- Later donation not increasing a queued de-staker's reserved MIM.
- Finalize de-stake burning escrowed Mana and paying reserved MIM.
- Non-MIM asset vault donation staying outside Mana NAV.
- Unauthorized treasury config update failing.

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

## Full Anchor Test Caveat

The default `Anchor.toml` test config includes Raydium-style mainnet account clones. That is useful for AMM tests, but it makes a simple Mana-only test more fragile because the local validator has to fetch cloned accounts from mainnet.

For the Mana treasury vault, prefer:

```bash
yarn test:mana-local
```

It starts a minimal local validator with only the Mana program loaded, so the test does not depend on mainnet clones.
