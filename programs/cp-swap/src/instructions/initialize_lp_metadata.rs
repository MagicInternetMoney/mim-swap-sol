use crate::error::ErrorCode;
use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::{
    metadata::{
        create_metadata_accounts_v3, mpl_token_metadata::types::DataV2, CreateMetadataAccountsV3,
        Metadata,
    },
    token_interface::Mint,
};

const MAX_METADATA_NAME_LEN: usize = 32;
const MAX_METADATA_SYMBOL_LEN: usize = 10;
const MAX_METADATA_URI_LEN: usize = 200;

#[derive(Accounts)]
pub struct InitializeLpMetadata<'info> {
    /// Only the pool creator can initialize wallet-visible LP metadata.
    #[account(mut, address = pool_state.load()?.pool_creator)]
    pub creator: Signer<'info>,

    /// CHECK: pool vault and lp mint authority
    #[account(
        seeds = [
            crate::AUTH_SEED.as_bytes(),
        ],
        bump,
    )]
    pub authority: UncheckedAccount<'info>,

    /// Pool state that owns the LP mint.
    pub pool_state: AccountLoader<'info, PoolState>,

    /// Pool LP mint.
    #[account(
        constraint = lp_mint.key() == pool_state.load()?.lp_mint @ ErrorCode::IncorrectLpMint
    )]
    pub lp_mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: Validated against the Metaplex metadata PDA for lp_mint.
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    pub metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn initialize_lp_metadata(
    ctx: Context<InitializeLpMetadata>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    require!(
        name.as_bytes().len() <= MAX_METADATA_NAME_LEN,
        ErrorCode::MetadataNameTooLong
    );
    require!(
        symbol.as_bytes().len() <= MAX_METADATA_SYMBOL_LEN,
        ErrorCode::MetadataSymbolTooLong
    );
    require!(
        uri.as_bytes().len() <= MAX_METADATA_URI_LEN,
        ErrorCode::MetadataUriTooLong
    );

    let metadata_program = ctx.accounts.metadata_program.key();
    let lp_mint_key = ctx.accounts.lp_mint.key();
    let (expected_metadata, _) = Pubkey::find_program_address(
        &[b"metadata", metadata_program.as_ref(), lp_mint_key.as_ref()],
        &metadata_program,
    );
    require_keys_eq!(
        ctx.accounts.metadata.key(),
        expected_metadata,
        ErrorCode::InvalidMetadataAccount
    );

    let data = DataV2 {
        name,
        symbol,
        uri,
        seller_fee_basis_points: 0,
        creators: None,
        collection: None,
        uses: None,
    };
    let authority_bump = [ctx.bumps.authority];
    let authority_seeds = [crate::AUTH_SEED.as_bytes(), authority_bump.as_ref()];

    create_metadata_accounts_v3(
        CpiContext::new_with_signer(
            ctx.accounts.metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                metadata: ctx.accounts.metadata.to_account_info(),
                mint: ctx.accounts.lp_mint.to_account_info(),
                mint_authority: ctx.accounts.authority.to_account_info(),
                payer: ctx.accounts.creator.to_account_info(),
                update_authority: ctx.accounts.creator.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
            &[&authority_seeds],
        ),
        data,
        true,
        true,
        None,
    )
}
