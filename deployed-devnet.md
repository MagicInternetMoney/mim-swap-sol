# Devnet Deployment

This file is the devnet deployment runbook and record for the MIM-backed Mana
treasury plus the CP swap AMM.

## Current Configured Addresses

These are the addresses currently configured in the repo. If
`scripts/setup-owned-keys.sh` is run again with new keypairs, update this section
before deploying.

| Item                          | Address                                        |
| ----------------------------- | ---------------------------------------------- |
| Mana treasury program         | `57zApTfybZ5tGo5iCE8v9Jxe2vBGjfAdowaKUk7j6m5e` |
| CP swap program               | `HBcK8eBUSWW3YGgrWv1aUpsMF6GtgkjwkcoBiHMw8gxY` |
| Admin authority               | `G5mgpU51BzRyG5u294aVnecaxhW121iig4Eg3wXPAVda` |
| Create-pool WSOL fee receiver | `9xBAJLDnp9PyGUtr1RNzJbQhYt3CXSD6FvCxYFa9VZWG` |
| Token Metadata program        | `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`  |
| CP swap AMM config index      | `0`                                            |

## Deployment Order

Deploy and initialize the treasury first. The AMM config points at the treasury
program, treasury state PDA, and reserve mint, so the treasury addresses need to
exist before pools are configured.

1. Generate or verify owned program/admin keys:

   ```bash
   npm run keys:setup
   ```

2. Fund the admin wallet on devnet. The default admin keypair path is:

   ```text
   target/deploy/mim_admin-keypair.json
   ```

3. Build deployable programs:

   ```bash
   NO_DNA=1 anchor build
   ```

4. Deploy `mana_treasury` to devnet:

   ```bash
   NO_DNA=1 anchor deploy -p mana_treasury --provider.cluster devnet --provider.wallet target/deploy/mim_admin-keypair.json
   ```

5. Initialize the devnet treasury and test reserve token:

   ```bash
   RPC_URL=https://api.devnet.solana.com \
   ADMIN_KEYPAIR=target/deploy/mim_admin-keypair.json \
   DMIM_METADATA_URI="" \
   MANA_METADATA_URI="" \
   DEVNET_COOLDOWN_SECONDS=30 \
   npm run devnet:setup-treasury
   ```

   This script:

   - Creates a standard SPL DMIM mint with 6 decimals, unless `DMIM_MINT` is set.
   - Creates Metaplex metadata for DMIM with `name = "Dev MIM"` and `symbol = "DMIM"`.
   - Mints `1,000,000,000` DMIM to the admin ATA when it creates the mint.
   - Initializes the authority-seeded treasury with DMIM as the reserve mint.
   - Creates Metaplex metadata for Mana with `name = "Mana"` and `symbol = "MANA"`.
   - Sets the devnet de-stake cooldown to `30` seconds.
   - Writes resulting addresses to `target/deploy/devnet-treasury.json`.

6. Deploy `raydium_cp_swap` to devnet:

   ```bash
   NO_DNA=1 anchor deploy -p raydium_cp_swap --provider.cluster devnet --provider.wallet target/deploy/mim_admin-keypair.json
   ```

7. Create or verify the first-release AMM config with treasury routing:

   ```bash
   RPC_URL=https://api.devnet.solana.com \
   ADMIN_KEYPAIR=target/deploy/mim_admin-keypair.json \
   npm run devnet:setup-cp-swap
   ```

   This script creates/verifies:

   - AMM config index `0`
   - `trade_fee_rate = 2_500` as the default UI/reference fee
   - `protocol_fee_rate = 200_000` so the protocol receives 20% of each
     pool-specific base fee
   - `fund_fee_rate = 0`
   - `creator_fee_rate = 0`
   - `create_pool_fee = 0`
   - the WSOL create-pool fee receiver token account, even though the fee is
     zero, because pool initialization still requires the account

   Each config should pass:

   - `treasury_program = 57zApTfybZ5tGo5iCE8v9Jxe2vBGjfAdowaKUk7j6m5e`
   - `treasury_state = <value from target/deploy/devnet-treasury.json>`
   - `mim_mint = <dmimMint from target/deploy/devnet-treasury.json>`

8. Run the fee keeper once, then schedule it every 5 minutes:

   ```bash
   RPC_URL=https://api.devnet.solana.com \
   ADMIN_KEYPAIR=target/deploy/mim_admin-keypair.json \
   npm run devnet:fee-keeper
   ```

   The keeper scans CP-swap pools, creates missing non-DMIM treasury asset
   vaults just in time, and sweeps protocol/fund fees to canonical treasury
   vaults. It does not automatically convert non-DMIM assets to DMIM.

## Devnet Treasury Output

After `npm run devnet:setup-treasury` succeeds, copy the generated values here
from `target/deploy/devnet-treasury.json`.

| Item                   | Devnet value                                   |
| ---------------------- | ---------------------------------------------- |
| Admin                  | `G5mgpU51BzRyG5u294aVnecaxhW121iig4Eg3wXPAVda` |
| DMIM mint              | `FBzs4xf4WrtbhUudP6r1pJy9mSxHD6dbqPwKnD5GsZHy` |
| DMIM admin ATA         | `8DBsMr13ZiDqCXKMistXHvD5fwYHqkJa39WY7VzqBKQk` |
| DMIM metadata PDA      | `8nYA5NcB7nYrRXWy91V8tPbviNLcfdjidUnWz8p5WYmS` |
| Treasury state PDA     | `9kC54MZdTkSXb6jwUiZji3uts5Ziht7FeQwasuL2i4TT` |
| Treasury authority PDA | `B1kwwavicxK5aS4Ug4VeyuBG4RHuGQWEKpx1WAYyGduw` |
| Mana mint              | `BCrgRHs1nrhvnLHxCyZg4cWfrnFTuJ4j2AEoUgjEbdCZ` |
| Mana metadata PDA      | `PuC126LDvq7TNNBvcogGgm8esnpwNK4eMwMqXn5zSqX`  |
| Active DMIM vault      | `EEyt3iE2pp9nmrStA1CStKiHZ8TZx6QxzNbAFYNZYAXi` |
| Pending DMIM vault     | `3K6Le2nsLaCJCSmfJhcjNuqqBLi85TU9rfKhYbQ5ZsdV` |
| Pending Mana vault     | `5mTaLYodMLA8vkK5UkuuzYpRub2Uwpo7nv8gBHFjzFTU` |
| Cooldown seconds       | `30`                                           |

## Devnet CP Swap Output

After `npm run devnet:setup-cp-swap` succeeds, copy the generated values here
from `target/deploy/devnet-cp-swap.json`.

| Item                     | Devnet value                                   |
| ------------------------ | ---------------------------------------------- |
| CP swap program          | `HBcK8eBUSWW3YGgrWv1aUpsMF6GtgkjwkcoBiHMw8gxY` |
| AMM config               | `HDc67djuMJJ8RRPcZU7jnqzAHzDV1PnLBhyPDDsdq3Wc` |
| AMM config index         | `0`                                            |
| Create-pool fee receiver | `9xBAJLDnp9PyGUtr1RNzJbQhYt3CXSD6FvCxYFa9VZWG` |
| Trade fee rate           | `2_500`                                        |
| Protocol fee rate        | `200_000`                                      |
| Fund fee rate            | `0`                                            |
| Creator fee rate         | `0`                                            |
| Create pool fee          | `0`                                            |

## 2026-07-10 CP Swap First-Release Run

| Item                          | Value                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| Program deploy tx             | `3cGZFum2SQbK3VwUx7mNAHzApfG3DnWGWdpEvwkUCUcVun2FzYzVxiY9uL6EhNkbrVAc8bgy1xjTf68Y4ggq17eg` |
| IDL account                   | `HBG6sjpgMSaNtiP9AKruRUoHzoPcGWHSh8mArHfL82aL`                                             |
| AMM config create tx          | `5c7ifTycz19ZyRFnB6D71TW54gqaww6sbggLBie2iqCsZ8Z3Lbi8sLM2gYuZbxWvKcw8oF2jBNRRafgiHfZqqz19` |
| Initial keeper dry-run result | `0 inspected, 0 eligible, 0 vaults, 0 sweeps`                                              |
| Initial keeper live result    | `0 inspected, 0 eligible, 0 vaults, 0 sweeps`                                              |

## 2026-07-10 CP Swap Smoke Test

| Item                    | Value                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Smoke pool              | `2DvuwYkXAqZSGVni6MFrVJuVB7fSZDaDrzH5iUpmVEAm`                                             |
| Smoke asset mint        | `6martsHjsobTNqPgNEmGs9hzGom7bqGQZoasMhz2P55C`                                             |
| Pool trade fee rate     | `50_000`                                                                                   |
| Initialize tx           | `3bbZn3tNDY916UZwWEWihxnaqQesVCxVMkUMGPUHa5Uebe9K4E8ZN495QauW2nFsGhtujx9CUgNnWkjqBaSebFM5` |
| Smoke-to-DMIM swap tx   | `64WRAZZ7SWYYCL8sPHBGi2zjYboBvePNdKsGzZS9f3BbANHtcCbvmSqyMu4S5K1zM9iVajkujoxSeQHPbBDMi6as` |
| DMIM-to-smoke swap tx   | `3buLcRLQTXTPebc4MVTfDrXsBZqMkAnP9nPVZdysKCXWxMF2KCmdbf18MK53jqLD9GY3ScQJ9JSUVjEM7ASQGcLn` |
| Asset vault create tx   | `3aRQmH9CdVM6LQGVngEy1AoYpeYBYf9p3SiN6a8vmBFd7HnzamW8sWkVxHS6Ue8vZPXAuQBJUAG6MvpuKHCjWHff` |
| Protocol sweep tx       | `5zMQHRAaFTQe8rfihijHJ8NBVZB1UbiD7gLEW7ypp4uD7h9rvKcniZek4KMbZFDhRUY6gYySrmezi3qoWESKcLwZ` |
| Protocol fees swept     | `10_000 SMOKE` and `10_000 DMIM`                                                           |
| Active DMIM vault delta | `+10_000`                                                                                  |
| Asset vault             | `5DaT1XxQM1f5hAapTUeyz73RJTgwzzgfmKp2k6JFCfEA`                                             |
| Asset token vault       | `6QUKZUo1Dg2Vf2KF4EVppXGERt1g7TF2t3i3NMkRTsh7`                                             |
| Asset vault delta       | `+10_000`                                                                                  |

## Verification

Run the local checks before deploying:

```bash
cargo fmt -- --check
cargo test -p mana-treasury --lib
cargo test -p raydium-cp-swap --lib
NO_DNA=1 anchor build -p mana_treasury
npm run test:mana-local
npm run test:fee-sweep-local
```

After devnet setup, verify:

```bash
cat target/deploy/devnet-treasury.json
```

Expected devnet properties:

- DMIM is a standard SPL Token mint with 6 decimals.
- DMIM has a Metaplex metadata account with `symbol = "DMIM"`.
- Mana has a Metaplex metadata account with `symbol = "MANA"`.
- The admin ATA owns `1,000,000,000` DMIM after a fresh setup-created mint.
- The treasury cooldown is `30`.
- The AMM config routes MIM fee sweeps to the active DMIM vault.
- The AMM config routes non-MIM fee sweeps to canonical treasury asset vaults.
- Permissionless pools reject a pool base fee of `0` and any value above
  `50_000` (5%).
- Permissionless pools accept `50_000`; with `protocol_fee_rate = 200_000`, the
  protocol receives 20% of the chosen base fee and LPs retain the remainder.

## Mainnet Notes

For mainnet, do not create DMIM. Initialize the treasury with the real MIM mint:

```text
89BZ5RU212yKr3iFdJHyn3ZsR37bS4s8TbmVb2yApump
```

Mainnet cooldown should be set to the production value, not the 30-second devnet
test value.
