# Devnet Deployment

This file is the devnet deployment runbook and record for the MIM-backed Mana
treasury plus the CP swap AMM.

## Current Configured Addresses

These are the addresses currently configured in the repo. If
`scripts/setup-owned-keys.sh` is run again with new keypairs, update this section
before deploying.

| Item | Address |
| --- | --- |
| Mana treasury program | `57zApTfybZ5tGo5iCE8v9Jxe2vBGjfAdowaKUk7j6m5e` |
| CP swap program | `HBcK8eBUSWW3YGgrWv1aUpsMF6GtgkjwkcoBiHMw8gxY` |
| Admin authority | `G5mgpU51BzRyG5u294aVnecaxhW121iig4Eg3wXPAVda` |
| Create-pool WSOL fee receiver | `9xBAJLDnp9PyGUtr1RNzJbQhYt3CXSD6FvCxYFa9VZWG` |
| Token Metadata program | `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s` |

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

7. Create AMM configs with treasury routing. Each config should pass:

   - `treasury_program = 57zApTfybZ5tGo5iCE8v9Jxe2vBGjfAdowaKUk7j6m5e`
   - `treasury_state = <value from target/deploy/devnet-treasury.json>`
   - `mim_mint = <dmimMint from target/deploy/devnet-treasury.json>`

## Devnet Treasury Output

After `npm run devnet:setup-treasury` succeeds, copy the generated values here
from `target/deploy/devnet-treasury.json`.

| Item | Devnet value |
| --- | --- |
| Admin | TBD |
| DMIM mint | TBD |
| DMIM admin ATA | TBD |
| DMIM metadata PDA | TBD |
| Treasury state PDA | TBD |
| Treasury authority PDA | TBD |
| Mana mint | TBD |
| Mana metadata PDA | TBD |
| Active DMIM vault | TBD |
| Pending DMIM vault | TBD |
| Pending Mana vault | TBD |
| Cooldown seconds | `30` |

## Verification

Run the local checks before deploying:

```bash
cargo fmt -- --check
cargo test -p mana-treasury --lib
cargo test -p raydium-cp-swap --lib
NO_DNA=1 anchor build -p mana_treasury
npm run test:mana-local
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

## Mainnet Notes

For mainnet, do not create DMIM. Initialize the treasury with the real MIM mint:

```text
89BZ5RU212yKr3iFdJHyn3ZsR37bS4s8TbmVb2yApump
```

Mainnet cooldown should be set to the production value, not the 30-second devnet
test value.
