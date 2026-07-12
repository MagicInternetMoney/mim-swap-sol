# Solana Mainnet Launch Cost

This document estimates the SOL needed to launch the MIM Swap Solana programs on
mainnet with an existing MIM mint.

## Scope

The estimate includes:

- Deploy `mana_treasury` and `raydium_cp_swap` as upgradeable programs.
- Publish Anchor IDL accounts for both programs.
- Initialize the treasury and AMM config.
- Use an existing MIM mint.
- Create the MIM/SOL, MIM/MANA, and MANA/SOL pools.
- Create LP metadata for all three pools.
- Create treasury asset vaults for SOL and MANA fee routing.

The estimate excludes:

- Initial liquidity deposited into the pools.
- Ongoing keeper operations after launch.
- Market movement in SOL/USD after the spot price check.

## Estimate

Estimated launch cost: **9.4012348 SOL**.

Buffered launch budget: **11.7515435 SOL** with a 25% buffer.

USD equivalents use the checked Coinbase spot price of **$77.265/SOL**:

- Estimated launch cost: **$726.39**
- Buffered launch budget: **$907.98**

## Cost Breakdown

| Item | SOL |
| --- | ---: |
| Deploy both upgradeable programs and executable accounts | 9.07724592 |
| Anchor IDL accounts for both programs | 0.11472864 |
| Treasury bootstrap with existing MIM mint | 0.02554864 |
| AMM config and create-pool fee receiver | 0.00457272 |
| Three pools with LP metadata | 0.17181696 |
| Treasury asset vaults for SOL and MANA fees | 0.00732192 |
| **Estimated total** | **9.40123480** |
| **25% buffered budget** | **11.75154350** |

## Assumptions

- Current build artifacts are used:
  - `mana_treasury.so` is 565,520 bytes.
  - `raydium_cp_swap.so` is 738,008 bytes.
- MIM already exists on mainnet, so no new MIM mint, MIM admin token account,
  or MIM metadata account is included.
- Mana mint and Mana metadata are created during treasury bootstrap.
- Each of the three launch pools gets LP metadata.
- SOL and MANA treasury asset vaults are created once each for fee routing.
- Transaction fees and priority fees are small relative to rent; the 25% buffer
  is intended to cover normal variance.
- Liquidity deposits are separate from this launch infrastructure budget.

## Sources

- Rent and live account lamport values were checked against devnet using Solana
  CLI 2.3.0.
- USD equivalents use Coinbase SOL/USD spot price checked during analysis:
  <https://api.coinbase.com/v2/prices/SOL-USD/spot>.
