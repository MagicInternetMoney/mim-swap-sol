use crate::error::ErrorCode;
use anchor_lang::prelude::*;

pub const AMM_CONFIG_SEED: &str = "amm_config";
pub const TREASURY_AUTHORITY_SEED: &[u8] = b"treasury_authority";
pub const ACTIVE_MIM_VAULT_SEED: &[u8] = b"active_mim_vault";
pub const ASSET_TOKEN_VAULT_SEED: &[u8] = b"asset_token_vault";

/// Holds the current owner of the factory
#[account]
#[derive(Default, Debug)]
pub struct AmmConfig {
    /// Bump to identify PDA
    pub bump: u8,
    /// Status to control if new pool can be create
    pub disable_create_pool: bool,
    /// Config index
    pub index: u16,
    /// The trade fee, denominated in hundredths of a bip (10^-6)
    pub trade_fee_rate: u64,
    /// The protocol fee
    pub protocol_fee_rate: u64,
    /// The fund fee, denominated in hundredths of a bip (10^-6)
    pub fund_fee_rate: u64,
    /// Fee for create a new pool
    pub create_pool_fee: u64,
    /// Address of the protocol fee owner
    pub protocol_owner: Pubkey,
    /// Address of the fund fee owner
    pub fund_owner: Pubkey,
    /// The pool creator fee, denominated in hundredths of a bip (10^-6)
    pub creator_fee_rate: u64,
    /// Mana treasury program that owns the canonical fee vault PDAs
    pub treasury_program: Pubkey,
    /// Mana treasury state used to derive canonical fee vault PDAs
    pub treasury_state: Pubkey,
    /// Mint that backs Mana and must route to the active MIM vault
    pub mim_mint: Pubkey,
    /// padding
    pub padding: [u64; 3],
}

impl AmmConfig {
    pub const LEN: usize = 8 + 1 + 1 + 2 + 4 * 8 + 32 * 5 + 8 + 8 * 3;

    pub fn treasury_authority(&self) -> Result<Pubkey> {
        self.validate_treasury_config()?;
        Ok(Pubkey::find_program_address(
            &[TREASURY_AUTHORITY_SEED, self.treasury_state.as_ref()],
            &self.treasury_program,
        )
        .0)
    }

    pub fn expected_fee_receiver(&self, mint: Pubkey) -> Result<Pubkey> {
        self.validate_treasury_config()?;
        let fee_receiver = if mint == self.mim_mint {
            Pubkey::find_program_address(
                &[ACTIVE_MIM_VAULT_SEED, self.treasury_state.as_ref()],
                &self.treasury_program,
            )
            .0
        } else {
            Pubkey::find_program_address(
                &[
                    ASSET_TOKEN_VAULT_SEED,
                    self.treasury_state.as_ref(),
                    mint.as_ref(),
                ],
                &self.treasury_program,
            )
            .0
        };
        Ok(fee_receiver)
    }

    fn validate_treasury_config(&self) -> Result<()> {
        require_keys_neq!(
            self.treasury_program,
            Pubkey::default(),
            ErrorCode::InvalidTreasuryFeeConfig
        );
        require_keys_neq!(
            self.treasury_state,
            Pubkey::default(),
            ErrorCode::InvalidTreasuryFeeConfig
        );
        require_keys_neq!(
            self.mim_mint,
            Pubkey::default(),
            ErrorCode::InvalidTreasuryFeeConfig
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config_with_treasury() -> AmmConfig {
        AmmConfig {
            treasury_program: Pubkey::new_unique(),
            treasury_state: Pubkey::new_unique(),
            mim_mint: Pubkey::new_unique(),
            ..AmmConfig::default()
        }
    }

    #[test]
    fn derives_treasury_authority() {
        let config = config_with_treasury();
        let expected = Pubkey::find_program_address(
            &[TREASURY_AUTHORITY_SEED, config.treasury_state.as_ref()],
            &config.treasury_program,
        )
        .0;

        assert_eq!(config.treasury_authority().unwrap(), expected);
    }

    #[test]
    fn derives_active_mim_vault_for_mim_fees() {
        let config = config_with_treasury();
        let expected = Pubkey::find_program_address(
            &[ACTIVE_MIM_VAULT_SEED, config.treasury_state.as_ref()],
            &config.treasury_program,
        )
        .0;

        assert_eq!(
            config.expected_fee_receiver(config.mim_mint).unwrap(),
            expected
        );
    }

    #[test]
    fn derives_asset_vault_for_non_mim_fees() {
        let config = config_with_treasury();
        let asset_mint = Pubkey::new_unique();
        let expected = Pubkey::find_program_address(
            &[
                ASSET_TOKEN_VAULT_SEED,
                config.treasury_state.as_ref(),
                asset_mint.as_ref(),
            ],
            &config.treasury_program,
        )
        .0;

        assert_eq!(config.expected_fee_receiver(asset_mint).unwrap(), expected);
    }

    #[test]
    fn rejects_unconfigured_treasury_routing() {
        let config = AmmConfig::default();

        assert!(config.treasury_authority().is_err());
        assert!(config.expected_fee_receiver(Pubkey::new_unique()).is_err());
    }
}
