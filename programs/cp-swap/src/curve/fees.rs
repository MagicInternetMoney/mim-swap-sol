//! All fee information, to be used for validation currently

pub const FEE_RATE_DENOMINATOR_VALUE: u64 = 1_000_000;

pub struct Fees {}

fn ceil_div(token_amount: u128, fee_numerator: u128, fee_denominator: u128) -> Option<u128> {
    if fee_denominator == 0 {
        return None;
    }
    token_amount
        .checked_mul(u128::from(fee_numerator))?
        .checked_add(fee_denominator)?
        .checked_sub(1)?
        .checked_div(fee_denominator)
}

/// Helper function for calculating swap fee
pub fn floor_div(token_amount: u128, fee_numerator: u128, fee_denominator: u128) -> Option<u128> {
    if fee_denominator == 0 {
        return None;
    }
    token_amount
        .checked_mul(fee_numerator)?
        .checked_div(fee_denominator)
}

impl Fees {
    /// Calculate the trading fee in trading tokens
    pub fn trading_fee(amount: u128, trade_fee_rate: u64) -> Option<u128> {
        ceil_div(
            amount,
            u128::from(trade_fee_rate),
            u128::from(FEE_RATE_DENOMINATOR_VALUE),
        )
    }

    /// Calculate the owner protocol fee in trading tokens
    pub fn protocol_fee(amount: u128, protocol_fee_rate: u64) -> Option<u128> {
        floor_div(
            amount,
            u128::from(protocol_fee_rate),
            u128::from(FEE_RATE_DENOMINATOR_VALUE),
        )
    }

    /// Calculate the owner fund fee in trading tokens
    pub fn fund_fee(amount: u128, fund_fee_rate: u64) -> Option<u128> {
        floor_div(
            amount,
            u128::from(fund_fee_rate),
            u128::from(FEE_RATE_DENOMINATOR_VALUE),
        )
    }

    /// Calculate the creator fee
    pub fn creator_fee(amount: u128, creator_fee_rate: u64) -> Option<u128> {
        ceil_div(
            amount,
            u128::from(creator_fee_rate),
            u128::from(FEE_RATE_DENOMINATOR_VALUE),
        )
    }

    pub fn split_creator_fee(
        total_fee: u128,
        trade_fee_rate: u64,
        creator_fee_rate: u64,
    ) -> Option<u128> {
        floor_div(
            total_fee,
            u128::from(creator_fee_rate),
            u128::from(trade_fee_rate + creator_fee_rate),
        )
    }

    pub fn calculate_pre_fee_amount(post_fee_amount: u128, trade_fee_rate: u64) -> Option<u128> {
        if trade_fee_rate == 0 {
            Some(post_fee_amount)
        } else {
            let numerator = post_fee_amount.checked_mul(u128::from(FEE_RATE_DENOMINATOR_VALUE))?;
            let denominator =
                u128::from(FEE_RATE_DENOMINATOR_VALUE).checked_sub(u128::from(trade_fee_rate))?;

            numerator
                .checked_add(denominator)?
                .checked_sub(1)?
                .checked_div(denominator)
        }
    }
}

#[cfg(test)]
mod fee_split_tests {
    use super::*;

    /// Verify the 80/20 LP/protocol split for a standard 0.25% pool fee.
    ///
    /// AMM config for this model:
    ///   pool_trade_fee_rate  = 2_500  (0.25%, set per-pool at creation)
    ///   protocol_fee_rate    = 200_000 (20% of the pool trade fee)
    ///   fund_fee_rate        = 0
    ///   creator_fee_rate     = 0
    ///
    /// On a 1_000_000 unit swap the expected breakdown is:
    ///   trade_fee  = ceil(1_000_000 * 2_500 / 1_000_000) = 2_500 units
    ///   protocol   = floor(2_500 * 200_000 / 1_000_000)  =   500 units  (20%)
    ///   lp_keep    = 2_500 - 500                         = 2_000 units  (80%)
    #[test]
    fn pool_fee_splits_20_pct_to_protocol() {
        let swap_amount: u128 = 1_000_000;

        // Pool-specific base fee rate (set by LP at pool creation, max 5%)
        let pool_trade_fee_rate: u64 = 2_500; // 0.25%
                                              // Protocol takes 20% of the base fee; remainder stays with LPs
        let protocol_fee_rate: u64 = 200_000; // 20% of trade fee
        let fund_fee_rate: u64 = 0;
        let creator_fee_rate: u64 = 0; // disabled for permissionless v1 pools

        let trade_fee = Fees::trading_fee(swap_amount, pool_trade_fee_rate).unwrap();
        let protocol_fee = Fees::protocol_fee(trade_fee, protocol_fee_rate).unwrap();
        let fund_fee = Fees::fund_fee(trade_fee, fund_fee_rate).unwrap();
        let creator_fee = Fees::creator_fee(swap_amount, creator_fee_rate).unwrap();
        let lp_fee = trade_fee - protocol_fee - fund_fee;

        assert_eq!(trade_fee, 2_500, "0.25% of 1M = 2_500");
        assert_eq!(protocol_fee, 500, "20% of 2_500 = 500 → treasury");
        assert_eq!(fund_fee, 0, "fund fee disabled");
        assert_eq!(
            creator_fee, 0,
            "creator fee disabled for permissionless pools"
        );
        assert_eq!(lp_fee, 2_000, "80% of 2_500 = 2_000 stays with LPs");

        // Invariant: all fee pieces account for the full trade_fee
        assert_eq!(protocol_fee + fund_fee + lp_fee, trade_fee);
    }

    /// Verify that a pool creator can choose a higher fee (e.g. 1%) and the
    /// 20/80 treasury/LP split still holds.
    #[test]
    fn pool_fee_1pct_splits_correctly() {
        let swap_amount: u128 = 1_000_000;
        let pool_trade_fee_rate: u64 = 10_000; // 1.0%
        let protocol_fee_rate: u64 = 200_000; // 20% of trade fee → treasury

        let trade_fee = Fees::trading_fee(swap_amount, pool_trade_fee_rate).unwrap();
        let protocol_fee = Fees::protocol_fee(trade_fee, protocol_fee_rate).unwrap();
        let lp_fee = trade_fee - protocol_fee;

        assert_eq!(trade_fee, 10_000);
        assert_eq!(protocol_fee, 2_000, "20% → treasury");
        assert_eq!(lp_fee, 8_000, "80% → LPs");
    }

    /// Verify the program boundary: pool_trade_fee_rate must be > 0 and ≤ 50_000 (5%).
    #[test]
    fn max_pool_fee_rate_is_5pct() {
        let swap_amount: u128 = 1_000_000;
        let max_fee_rate: u64 = 50_000; // 5% — the on-chain cap
        let trade_fee = Fees::trading_fee(swap_amount, max_fee_rate).unwrap();
        assert_eq!(trade_fee, 50_000, "5% of 1M = 50_000");

        // Anything above 50_000 is rejected by the `initialize` instruction guard.
        // We just confirm the math is sound at the boundary.
        let protocol_fee = Fees::protocol_fee(trade_fee, 200_000).unwrap();
        assert_eq!(protocol_fee, 10_000, "20% of 50_000 = 10_000 → treasury");
    }
}
