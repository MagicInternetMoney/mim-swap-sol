use anchor_lang::{
    prelude::*,
    solana_program::{
        instruction::{AccountMeta, Instruction},
        program::invoke_signed,
    },
};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Burn, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked},
};

declare_id!("57zApTfybZ5tGo5iCE8v9Jxe2vBGjfAdowaKUk7j6m5e");

pub const TREASURY_SEED: &[u8] = b"treasury";
pub const TREASURY_AUTHORITY_SEED: &[u8] = b"treasury_authority";
pub const MANA_MINT_SEED: &[u8] = b"mana_mint";
pub const ACTIVE_MIM_VAULT_SEED: &[u8] = b"active_mim_vault";
pub const PENDING_MIM_VAULT_SEED: &[u8] = b"pending_mim_vault";
pub const PENDING_MANA_VAULT_SEED: &[u8] = b"pending_mana_vault";
pub const REDEMPTION_SEED: &[u8] = b"redemption";
pub const ASSET_VAULT_SEED: &[u8] = b"asset_vault";
pub const ASSET_TOKEN_VAULT_SEED: &[u8] = b"asset_token_vault";
pub const DEFAULT_COOLDOWN_SECONDS: u64 = 259_200;
pub const MIM_MINT: Pubkey = pubkey!("89BZ5RU212yKr3iFdJHyn3ZsR37bS4s8TbmVb2yApump");

#[program]
pub mod mana_treasury {
    use super::*;

    pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
        #[cfg(not(feature = "local-testing"))]
        require_keys_eq!(
            ctx.accounts.mim_mint.key(),
            MIM_MINT,
            TreasuryError::InvalidMimMint
        );

        let state = &mut ctx.accounts.treasury_state;
        state.authority = ctx.accounts.authority.key();
        state.pending_authority = Pubkey::default();
        state.mim_mint = ctx.accounts.mim_mint.key();
        state.mana_mint = ctx.accounts.mana_mint.key();
        state.active_mim_vault = ctx.accounts.active_mim_vault.key();
        state.pending_mim_vault = ctx.accounts.pending_mim_vault.key();
        state.pending_mana_vault = ctx.accounts.pending_mana_vault.key();
        state.cooldown_seconds = DEFAULT_COOLDOWN_SECONDS;
        state.swap_router = Pubkey::default();
        state.pending_mana_supply = 0;
        state.bump = ctx.bumps.treasury_state;
        state.authority_bump = ctx.bumps.treasury_authority;
        Ok(())
    }

    pub fn deposit_mim(ctx: Context<DepositMim>, amount: u64, min_mana_out: u64) -> Result<()> {
        require!(amount > 0, TreasuryError::InvalidAmount);

        let active_mim_balance = ctx.accounts.active_mim_vault.amount;
        let active_mana_supply = ctx
            .accounts
            .treasury_state
            .active_mana_supply(ctx.accounts.mana_mint.supply)?;
        let mana_out = calculate_mana_for_deposit(amount, active_mim_balance, active_mana_supply)?;
        require!(mana_out >= min_mana_out, TreasuryError::ExceededSlippage);
        require!(mana_out > 0, TreasuryError::ZeroManaOut);

        transfer_checked(
            ctx.accounts.depositor.to_account_info(),
            ctx.accounts.depositor_mim.to_account_info(),
            ctx.accounts.active_mim_vault.to_account_info(),
            ctx.accounts.mim_mint.to_account_info(),
            ctx.accounts.mim_token_program.to_account_info(),
            amount,
            ctx.accounts.mim_mint.decimals,
        )?;

        let treasury_key = ctx.accounts.treasury_state.key();
        let authority_bump = [ctx.accounts.treasury_state.authority_bump];
        let authority_seeds = [
            TREASURY_AUTHORITY_SEED,
            treasury_key.as_ref(),
            authority_bump.as_ref(),
        ];
        mint_to(
            ctx.accounts.treasury_authority.to_account_info(),
            ctx.accounts.mana_mint.to_account_info(),
            ctx.accounts.depositor_mana.to_account_info(),
            ctx.accounts.mana_token_program.to_account_info(),
            mana_out,
            &[&authority_seeds],
        )
    }

    pub fn donate_mim(ctx: Context<DonateMim>, amount: u64) -> Result<()> {
        require!(amount > 0, TreasuryError::InvalidAmount);
        transfer_checked(
            ctx.accounts.donor.to_account_info(),
            ctx.accounts.donor_mim.to_account_info(),
            ctx.accounts.active_mim_vault.to_account_info(),
            ctx.accounts.mim_mint.to_account_info(),
            ctx.accounts.mim_token_program.to_account_info(),
            amount,
            ctx.accounts.mim_mint.decimals,
        )
    }

    pub fn create_asset_vault(ctx: Context<CreateAssetVault>) -> Result<()> {
        require_authority(&ctx.accounts.treasury_state, &ctx.accounts.authority)?;
        require_keys_neq!(
            ctx.accounts.asset_mint.key(),
            ctx.accounts.treasury_state.mim_mint,
            TreasuryError::InvalidAssetMint
        );

        let asset_vault = &mut ctx.accounts.asset_vault;
        asset_vault.treasury = ctx.accounts.treasury_state.key();
        asset_vault.mint = ctx.accounts.asset_mint.key();
        asset_vault.token_account = ctx.accounts.asset_token_account.key();
        asset_vault.bump = ctx.bumps.asset_vault;
        Ok(())
    }

    pub fn donate_asset(ctx: Context<DonateAsset>, amount: u64) -> Result<()> {
        require!(amount > 0, TreasuryError::InvalidAmount);
        transfer_checked(
            ctx.accounts.donor.to_account_info(),
            ctx.accounts.donor_asset.to_account_info(),
            ctx.accounts.asset_token_account.to_account_info(),
            ctx.accounts.asset_mint.to_account_info(),
            ctx.accounts.asset_token_program.to_account_info(),
            amount,
            ctx.accounts.asset_mint.decimals,
        )
    }

    pub fn set_swap_router(ctx: Context<SetSwapRouter>, router: Pubkey) -> Result<()> {
        require_authority(&ctx.accounts.treasury_state, &ctx.accounts.authority)?;
        ctx.accounts.treasury_state.swap_router = router;
        Ok(())
    }

    pub fn set_cooldown_seconds(
        ctx: Context<SetCooldownSeconds>,
        cooldown_seconds: u64,
    ) -> Result<()> {
        require_authority(&ctx.accounts.treasury_state, &ctx.accounts.authority)?;
        ctx.accounts.treasury_state.cooldown_seconds = cooldown_seconds;
        Ok(())
    }

    pub fn swap_asset_to_mim(
        ctx: Context<SwapAssetToMim>,
        amount: u64,
        min_mim_out: u64,
        router_ix_data: Vec<u8>,
    ) -> Result<()> {
        require!(amount > 0, TreasuryError::InvalidAmount);
        require!(min_mim_out > 0, TreasuryError::InvalidAmount);
        require_authority(&ctx.accounts.treasury_state, &ctx.accounts.authority)?;
        require_keys_neq!(
            ctx.accounts.treasury_state.swap_router,
            Pubkey::default(),
            TreasuryError::SwapRouterNotSet
        );
        require_keys_eq!(
            ctx.accounts.router_program.key(),
            ctx.accounts.treasury_state.swap_router,
            TreasuryError::InvalidSwapRouter
        );

        let asset_before = ctx.accounts.asset_token_account.amount;
        let mim_before = ctx.accounts.active_mim_vault.amount;
        let metas = ctx
            .remaining_accounts
            .iter()
            .map(|account| {
                let is_signer =
                    account.is_signer || account.key() == ctx.accounts.treasury_authority.key();
                if account.is_writable {
                    AccountMeta::new(account.key(), is_signer)
                } else {
                    AccountMeta::new_readonly(account.key(), is_signer)
                }
            })
            .collect::<Vec<_>>();
        let ix = Instruction {
            program_id: ctx.accounts.router_program.key(),
            accounts: metas,
            data: router_ix_data,
        };

        let treasury_key = ctx.accounts.treasury_state.key();
        let authority_bump = [ctx.accounts.treasury_state.authority_bump];
        let authority_seeds = [
            TREASURY_AUTHORITY_SEED,
            treasury_key.as_ref(),
            authority_bump.as_ref(),
        ];
        invoke_signed(&ix, ctx.remaining_accounts, &[&authority_seeds])?;

        ctx.accounts.asset_token_account.reload()?;
        ctx.accounts.active_mim_vault.reload()?;

        let asset_spent = asset_before
            .checked_sub(ctx.accounts.asset_token_account.amount)
            .ok_or(TreasuryError::InvalidSwapResult)?;
        let mim_out = ctx
            .accounts
            .active_mim_vault
            .amount
            .checked_sub(mim_before)
            .ok_or(TreasuryError::InvalidSwapResult)?;
        require!(asset_spent <= amount, TreasuryError::InvalidSwapResult);
        require!(mim_out >= min_mim_out, TreasuryError::ExceededSlippage);
        Ok(())
    }

    pub fn start_destake(
        ctx: Context<StartDestake>,
        mana_amount: u64,
        min_mim_out: u64,
    ) -> Result<()> {
        require!(mana_amount > 0, TreasuryError::InvalidAmount);

        let active_mim_balance = ctx.accounts.active_mim_vault.amount;
        let active_mana_supply = ctx
            .accounts
            .treasury_state
            .active_mana_supply(ctx.accounts.mana_mint.supply)?;
        let reserved_mim =
            calculate_mim_for_redemption(mana_amount, active_mim_balance, active_mana_supply)?;
        require!(reserved_mim >= min_mim_out, TreasuryError::ExceededSlippage);
        require!(reserved_mim > 0, TreasuryError::ZeroMimOut);

        transfer_checked(
            ctx.accounts.owner.to_account_info(),
            ctx.accounts.owner_mana.to_account_info(),
            ctx.accounts.pending_mana_vault.to_account_info(),
            ctx.accounts.mana_mint.to_account_info(),
            ctx.accounts.mana_token_program.to_account_info(),
            mana_amount,
            ctx.accounts.mana_mint.decimals,
        )?;

        let treasury_key = ctx.accounts.treasury_state.key();
        let authority_bump = [ctx.accounts.treasury_state.authority_bump];
        let authority_seeds = [
            TREASURY_AUTHORITY_SEED,
            treasury_key.as_ref(),
            authority_bump.as_ref(),
        ];
        transfer_checked_signed(
            ctx.accounts.treasury_authority.to_account_info(),
            ctx.accounts.active_mim_vault.to_account_info(),
            ctx.accounts.pending_mim_vault.to_account_info(),
            ctx.accounts.mim_mint.to_account_info(),
            ctx.accounts.mim_token_program.to_account_info(),
            reserved_mim,
            ctx.accounts.mim_mint.decimals,
            &[&authority_seeds],
        )?;

        let state = &mut ctx.accounts.treasury_state;
        state.pending_mana_supply = state
            .pending_mana_supply
            .checked_add(mana_amount)
            .ok_or(TreasuryError::MathOverflow)?;

        let request = &mut ctx.accounts.redemption_request;
        request.owner = ctx.accounts.owner.key();
        request.treasury = state.key();
        request.mana_amount = mana_amount;
        request.reserved_mim_amount = reserved_mim;
        request.unlock_timestamp = Clock::get()?
            .unix_timestamp
            .checked_add(state.cooldown_seconds as i64)
            .ok_or(TreasuryError::MathOverflow)?;
        request.finalized = false;
        request.bump = ctx.bumps.redemption_request;
        Ok(())
    }

    pub fn finalize_destake(ctx: Context<FinalizeDestake>) -> Result<()> {
        let request = &mut ctx.accounts.redemption_request;
        require!(!request.finalized, TreasuryError::AlreadyFinalized);
        require!(
            Clock::get()?.unix_timestamp >= request.unlock_timestamp,
            TreasuryError::CooldownActive
        );

        let treasury_key = ctx.accounts.treasury_state.key();
        let authority_bump = [ctx.accounts.treasury_state.authority_bump];
        let authority_seeds = [
            TREASURY_AUTHORITY_SEED,
            treasury_key.as_ref(),
            authority_bump.as_ref(),
        ];

        burn(
            ctx.accounts.treasury_authority.to_account_info(),
            ctx.accounts.pending_mana_vault.to_account_info(),
            ctx.accounts.mana_mint.to_account_info(),
            ctx.accounts.mana_token_program.to_account_info(),
            request.mana_amount,
            &[&authority_seeds],
        )?;

        transfer_checked_signed(
            ctx.accounts.treasury_authority.to_account_info(),
            ctx.accounts.pending_mim_vault.to_account_info(),
            ctx.accounts.owner_mim.to_account_info(),
            ctx.accounts.mim_mint.to_account_info(),
            ctx.accounts.mim_token_program.to_account_info(),
            request.reserved_mim_amount,
            ctx.accounts.mim_mint.decimals,
            &[&authority_seeds],
        )?;

        let state = &mut ctx.accounts.treasury_state;
        state.pending_mana_supply = state
            .pending_mana_supply
            .checked_sub(request.mana_amount)
            .ok_or(TreasuryError::MathOverflow)?;
        request.finalized = true;
        Ok(())
    }

    pub fn set_treasury_authority(
        ctx: Context<SetTreasuryAuthority>,
        pending_authority: Pubkey,
    ) -> Result<()> {
        require_authority(&ctx.accounts.treasury_state, &ctx.accounts.authority)?;
        require_keys_neq!(
            pending_authority,
            Pubkey::default(),
            TreasuryError::InvalidAuthority
        );
        ctx.accounts.treasury_state.pending_authority = pending_authority;
        Ok(())
    }

    pub fn accept_treasury_authority(ctx: Context<AcceptTreasuryAuthority>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.new_authority.key(),
            ctx.accounts.treasury_state.pending_authority,
            TreasuryError::InvalidAuthority
        );
        let state = &mut ctx.accounts.treasury_state;
        state.authority = ctx.accounts.new_authority.key();
        state.pending_authority = Pubkey::default();
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        seeds = [TREASURY_SEED],
        bump,
        space = 8 + TreasuryState::LEN,
    )]
    pub treasury_state: Account<'info, TreasuryState>,
    /// CHECK: PDA that owns treasury vaults and signs Mana mint/burn CPIs.
    #[account(
        seeds = [TREASURY_AUTHORITY_SEED, treasury_state.key().as_ref()],
        bump,
    )]
    pub treasury_authority: UncheckedAccount<'info>,
    pub mim_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = authority,
        seeds = [MANA_MINT_SEED, treasury_state.key().as_ref()],
        bump,
        mint::decimals = mim_mint.decimals,
        mint::authority = treasury_authority,
        mint::token_program = mana_token_program,
    )]
    pub mana_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = authority,
        seeds = [ACTIVE_MIM_VAULT_SEED, treasury_state.key().as_ref()],
        bump,
        token::mint = mim_mint,
        token::authority = treasury_authority,
        token::token_program = mim_token_program,
    )]
    pub active_mim_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = authority,
        seeds = [PENDING_MIM_VAULT_SEED, treasury_state.key().as_ref()],
        bump,
        token::mint = mim_mint,
        token::authority = treasury_authority,
        token::token_program = mim_token_program,
    )]
    pub pending_mim_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = authority,
        seeds = [PENDING_MANA_VAULT_SEED, treasury_state.key().as_ref()],
        bump,
        token::mint = mana_mint,
        token::authority = treasury_authority,
        token::token_program = mana_token_program,
    )]
    pub pending_mana_vault: InterfaceAccount<'info, TokenAccount>,
    pub mim_token_program: Interface<'info, TokenInterface>,
    pub mana_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositMim<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(mut)]
    pub treasury_state: Account<'info, TreasuryState>,
    /// CHECK: PDA signer.
    #[account(
        seeds = [TREASURY_AUTHORITY_SEED, treasury_state.key().as_ref()],
        bump = treasury_state.authority_bump,
    )]
    pub treasury_authority: UncheckedAccount<'info>,
    #[account(address = treasury_state.mim_mint)]
    pub mim_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, address = treasury_state.mana_mint)]
    pub mana_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = mim_mint,
        token::authority = depositor,
        token::token_program = mim_token_program,
    )]
    pub depositor_mim: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = depositor,
        associated_token::mint = mana_mint,
        associated_token::authority = depositor,
        associated_token::token_program = mana_token_program,
    )]
    pub depositor_mana: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = treasury_state.active_mim_vault)]
    pub active_mim_vault: InterfaceAccount<'info, TokenAccount>,
    pub mim_token_program: Interface<'info, TokenInterface>,
    pub mana_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DonateMim<'info> {
    #[account(mut)]
    pub donor: Signer<'info>,
    pub treasury_state: Account<'info, TreasuryState>,
    #[account(address = treasury_state.mim_mint)]
    pub mim_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = mim_mint,
        token::authority = donor,
        token::token_program = mim_token_program,
    )]
    pub donor_mim: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = treasury_state.active_mim_vault)]
    pub active_mim_vault: InterfaceAccount<'info, TokenAccount>,
    pub mim_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct CreateAssetVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub treasury_state: Account<'info, TreasuryState>,
    /// CHECK: PDA that owns asset vault token accounts.
    #[account(
        seeds = [TREASURY_AUTHORITY_SEED, treasury_state.key().as_ref()],
        bump = treasury_state.authority_bump,
    )]
    pub treasury_authority: UncheckedAccount<'info>,
    pub asset_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = authority,
        seeds = [
            ASSET_VAULT_SEED,
            treasury_state.key().as_ref(),
            asset_mint.key().as_ref(),
        ],
        bump,
        space = 8 + AssetVault::LEN,
    )]
    pub asset_vault: Account<'info, AssetVault>,
    #[account(
        init,
        payer = authority,
        seeds = [
            ASSET_TOKEN_VAULT_SEED,
            treasury_state.key().as_ref(),
            asset_mint.key().as_ref(),
        ],
        bump,
        token::mint = asset_mint,
        token::authority = treasury_authority,
        token::token_program = asset_token_program,
    )]
    pub asset_token_account: InterfaceAccount<'info, TokenAccount>,
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DonateAsset<'info> {
    #[account(mut)]
    pub donor: Signer<'info>,
    pub treasury_state: Account<'info, TreasuryState>,
    pub asset_mint: InterfaceAccount<'info, Mint>,
    #[account(
        constraint = asset_vault.treasury == treasury_state.key() @ TreasuryError::InvalidAssetVault,
        constraint = asset_vault.mint == asset_mint.key() @ TreasuryError::InvalidAssetVault,
        constraint = asset_vault.token_account == asset_token_account.key() @ TreasuryError::InvalidAssetVault,
    )]
    pub asset_vault: Account<'info, AssetVault>,
    #[account(
        mut,
        token::mint = asset_mint,
        token::authority = donor,
        token::token_program = asset_token_program,
    )]
    pub donor_asset: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = asset_vault.token_account)]
    pub asset_token_account: InterfaceAccount<'info, TokenAccount>,
    pub asset_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SetSwapRouter<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    pub treasury_state: Account<'info, TreasuryState>,
}

#[derive(Accounts)]
pub struct SetCooldownSeconds<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    pub treasury_state: Account<'info, TreasuryState>,
}

#[derive(Accounts)]
pub struct SwapAssetToMim<'info> {
    pub authority: Signer<'info>,
    pub treasury_state: Account<'info, TreasuryState>,
    /// CHECK: PDA signer passed to the configured router CPI.
    #[account(
        seeds = [TREASURY_AUTHORITY_SEED, treasury_state.key().as_ref()],
        bump = treasury_state.authority_bump,
    )]
    pub treasury_authority: UncheckedAccount<'info>,
    pub asset_mint: InterfaceAccount<'info, Mint>,
    #[account(
        constraint = asset_vault.treasury == treasury_state.key() @ TreasuryError::InvalidAssetVault,
        constraint = asset_vault.mint == asset_mint.key() @ TreasuryError::InvalidAssetVault,
        constraint = asset_vault.token_account == asset_token_account.key() @ TreasuryError::InvalidAssetVault,
    )]
    pub asset_vault: Account<'info, AssetVault>,
    #[account(mut, address = asset_vault.token_account)]
    pub asset_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = treasury_state.active_mim_vault)]
    pub active_mim_vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Checked against treasury_state.swap_router.
    pub router_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct StartDestake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub treasury_state: Account<'info, TreasuryState>,
    /// CHECK: PDA signer.
    #[account(
        seeds = [TREASURY_AUTHORITY_SEED, treasury_state.key().as_ref()],
        bump = treasury_state.authority_bump,
    )]
    pub treasury_authority: UncheckedAccount<'info>,
    #[account(address = treasury_state.mim_mint)]
    pub mim_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, address = treasury_state.mana_mint)]
    pub mana_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = mana_mint,
        token::authority = owner,
        token::token_program = mana_token_program,
    )]
    pub owner_mana: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = treasury_state.pending_mana_vault)]
    pub pending_mana_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = treasury_state.active_mim_vault)]
    pub active_mim_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = treasury_state.pending_mim_vault)]
    pub pending_mim_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = owner,
        seeds = [REDEMPTION_SEED, treasury_state.key().as_ref(), owner.key().as_ref()],
        bump,
        space = 8 + RedemptionRequest::LEN,
    )]
    pub redemption_request: Account<'info, RedemptionRequest>,
    pub mim_token_program: Interface<'info, TokenInterface>,
    pub mana_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeDestake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub treasury_state: Account<'info, TreasuryState>,
    /// CHECK: PDA signer.
    #[account(
        seeds = [TREASURY_AUTHORITY_SEED, treasury_state.key().as_ref()],
        bump = treasury_state.authority_bump,
    )]
    pub treasury_authority: UncheckedAccount<'info>,
    #[account(address = treasury_state.mim_mint)]
    pub mim_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, address = treasury_state.mana_mint)]
    pub mana_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, address = treasury_state.pending_mim_vault)]
    pub pending_mim_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = treasury_state.pending_mana_vault)]
    pub pending_mana_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = mim_mint,
        associated_token::authority = owner,
        associated_token::token_program = mim_token_program,
    )]
    pub owner_mim: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        close = owner,
        seeds = [REDEMPTION_SEED, treasury_state.key().as_ref(), owner.key().as_ref()],
        bump = redemption_request.bump,
        constraint = redemption_request.owner == owner.key() @ TreasuryError::InvalidRedemptionOwner,
        constraint = redemption_request.treasury == treasury_state.key() @ TreasuryError::InvalidRedemptionOwner,
    )]
    pub redemption_request: Account<'info, RedemptionRequest>,
    pub mim_token_program: Interface<'info, TokenInterface>,
    pub mana_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetTreasuryAuthority<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    pub treasury_state: Account<'info, TreasuryState>,
}

#[derive(Accounts)]
pub struct AcceptTreasuryAuthority<'info> {
    pub new_authority: Signer<'info>,
    #[account(mut)]
    pub treasury_state: Account<'info, TreasuryState>,
}

#[account]
#[derive(Default, Debug)]
pub struct TreasuryState {
    pub authority: Pubkey,
    pub pending_authority: Pubkey,
    pub mim_mint: Pubkey,
    pub mana_mint: Pubkey,
    pub active_mim_vault: Pubkey,
    pub pending_mim_vault: Pubkey,
    pub pending_mana_vault: Pubkey,
    pub cooldown_seconds: u64,
    pub swap_router: Pubkey,
    pub pending_mana_supply: u64,
    pub bump: u8,
    pub authority_bump: u8,
}

impl TreasuryState {
    pub const LEN: usize = 8 * 32 + 2 * 8 + 2;

    pub fn active_mana_supply(&self, total_mana_supply: u64) -> Result<u64> {
        total_mana_supply
            .checked_sub(self.pending_mana_supply)
            .ok_or(TreasuryError::MathOverflow.into())
    }
}

#[account]
#[derive(Default, Debug)]
pub struct AssetVault {
    pub treasury: Pubkey,
    pub mint: Pubkey,
    pub token_account: Pubkey,
    pub bump: u8,
}

impl AssetVault {
    pub const LEN: usize = 3 * 32 + 1;
}

#[account]
#[derive(Default, Debug)]
pub struct RedemptionRequest {
    pub owner: Pubkey,
    pub treasury: Pubkey,
    pub mana_amount: u64,
    pub reserved_mim_amount: u64,
    pub unlock_timestamp: i64,
    pub finalized: bool,
    pub bump: u8,
}

impl RedemptionRequest {
    pub const LEN: usize = 2 * 32 + 3 * 8 + 2;
}

#[error_code]
pub enum TreasuryError {
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid MIM mint")]
    InvalidMimMint,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Exceeded slippage limit")]
    ExceededSlippage,
    #[msg("Mana output is zero")]
    ZeroManaOut,
    #[msg("MIM output is zero")]
    ZeroMimOut,
    #[msg("Invalid treasury balance")]
    InvalidTreasuryBalance,
    #[msg("Invalid authority")]
    InvalidAuthority,
    #[msg("Invalid asset mint")]
    InvalidAssetMint,
    #[msg("Invalid asset vault")]
    InvalidAssetVault,
    #[msg("Swap router is not set")]
    SwapRouterNotSet,
    #[msg("Invalid swap router")]
    InvalidSwapRouter,
    #[msg("Invalid swap result")]
    InvalidSwapResult,
    #[msg("Cooldown is still active")]
    CooldownActive,
    #[msg("Redemption already finalized")]
    AlreadyFinalized,
    #[msg("Invalid redemption owner")]
    InvalidRedemptionOwner,
}

fn require_authority(state: &TreasuryState, authority: &Signer) -> Result<()> {
    require_keys_eq!(
        authority.key(),
        state.authority,
        TreasuryError::InvalidAuthority
    );
    Ok(())
}

fn calculate_mana_for_deposit(
    amount: u64,
    active_mim_balance: u64,
    active_mana_supply: u64,
) -> Result<u64> {
    if active_mana_supply == 0 {
        return Ok(amount);
    }
    require!(
        active_mim_balance > 0,
        TreasuryError::InvalidTreasuryBalance
    );
    let mana_out = (amount as u128)
        .checked_mul(active_mana_supply as u128)
        .ok_or(TreasuryError::MathOverflow)?
        .checked_div(active_mim_balance as u128)
        .ok_or(TreasuryError::MathOverflow)?;
    u64::try_from(mana_out).map_err(|_| TreasuryError::MathOverflow.into())
}

fn calculate_mim_for_redemption(
    mana_amount: u64,
    active_mim_balance: u64,
    active_mana_supply: u64,
) -> Result<u64> {
    require!(
        active_mana_supply > 0,
        TreasuryError::InvalidTreasuryBalance
    );
    let mim_out = (mana_amount as u128)
        .checked_mul(active_mim_balance as u128)
        .ok_or(TreasuryError::MathOverflow)?
        .checked_div(active_mana_supply as u128)
        .ok_or(TreasuryError::MathOverflow)?;
    u64::try_from(mim_out).map_err(|_| TreasuryError::MathOverflow.into())
}

fn transfer_checked<'info>(
    authority: AccountInfo<'info>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
    decimals: u8,
) -> Result<()> {
    token_interface::transfer_checked(
        CpiContext::new(
            token_program,
            TransferChecked {
                from,
                mint,
                to,
                authority,
            },
        ),
        amount,
        decimals,
    )
}

fn transfer_checked_signed<'info>(
    authority: AccountInfo<'info>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
    decimals: u8,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program,
            TransferChecked {
                from,
                mint,
                to,
                authority,
            },
            signer_seeds,
        ),
        amount,
        decimals,
    )
}

fn mint_to<'info>(
    authority: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    to: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    token_interface::mint_to(
        CpiContext::new_with_signer(
            token_program,
            MintTo {
                mint,
                to,
                authority,
            },
            signer_seeds,
        ),
        amount,
    )
}

fn burn<'info>(
    authority: AccountInfo<'info>,
    from: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    token_interface::burn(
        CpiContext::new_with_signer(
            token_program,
            Burn {
                mint,
                from,
                authority,
            },
            signer_seeds,
        ),
        amount,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_deposit_mints_one_to_one() {
        assert_eq!(calculate_mana_for_deposit(1_000, 0, 0).unwrap(), 1_000);
    }

    #[test]
    fn later_deposit_is_nav_priced() {
        assert_eq!(
            calculate_mana_for_deposit(1_000, 12_000, 10_000).unwrap(),
            833
        );
    }

    #[test]
    fn redemption_is_nav_priced() {
        assert_eq!(
            calculate_mim_for_redemption(1_000, 12_000, 10_000).unwrap(),
            1_200
        );
    }
}
