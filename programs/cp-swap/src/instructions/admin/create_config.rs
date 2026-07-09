use crate::error::ErrorCode;
use crate::states::*;
use anchor_lang::prelude::*;
use std::ops::DerefMut;

#[derive(Accounts)]
#[instruction(index: u16)]
pub struct CreateAmmConfig<'info> {
    /// Address to be set as protocol owner.
    #[account(
        mut,
        address = crate::admin::ID @ ErrorCode::InvalidOwner
    )]
    pub owner: Signer<'info>,

    /// Initialize config state account to store protocol owner address and fee rates.
    #[account(
        init,
        seeds = [
            AMM_CONFIG_SEED.as_bytes(),
            &index.to_be_bytes()
        ],
        bump,
        payer = owner,
        space = AmmConfig::LEN
    )]
    pub amm_config: Account<'info, AmmConfig>,

    pub system_program: Program<'info, System>,
}

pub fn create_amm_config(
    ctx: Context<CreateAmmConfig>,
    index: u16,
    trade_fee_rate: u64,
    protocol_fee_rate: u64,
    fund_fee_rate: u64,
    create_pool_fee: u64,
    creator_fee_rate: u64,
    treasury_program: Pubkey,
    treasury_state: Pubkey,
    mim_mint: Pubkey,
) -> Result<()> {
    require_keys_neq!(
        treasury_program,
        Pubkey::default(),
        ErrorCode::InvalidTreasuryFeeConfig
    );
    require_keys_neq!(
        treasury_state,
        Pubkey::default(),
        ErrorCode::InvalidTreasuryFeeConfig
    );
    require_keys_neq!(
        mim_mint,
        Pubkey::default(),
        ErrorCode::InvalidTreasuryFeeConfig
    );

    let amm_config = ctx.accounts.amm_config.deref_mut();
    amm_config.protocol_owner = ctx.accounts.owner.key();
    amm_config.bump = ctx.bumps.amm_config;
    amm_config.disable_create_pool = false;
    amm_config.index = index;
    amm_config.trade_fee_rate = trade_fee_rate;
    amm_config.protocol_fee_rate = protocol_fee_rate;
    amm_config.fund_fee_rate = fund_fee_rate;
    amm_config.create_pool_fee = create_pool_fee;
    amm_config.fund_owner = ctx.accounts.owner.key();
    amm_config.creator_fee_rate = creator_fee_rate;
    amm_config.treasury_program = treasury_program;
    amm_config.treasury_state = treasury_state;
    amm_config.mim_mint = mim_mint;
    Ok(())
}
