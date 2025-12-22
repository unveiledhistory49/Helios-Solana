use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("6uwQNHMkDsrNQw8y1XNBAHT5xYzh9YN4sdMD2tw6C1fi");

#[program]
pub mod vault_program {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault_state = &mut ctx.accounts.vault_state;
        vault_state.total_deposited = 0;
        vault_state.batch_count = 0;
        vault_state.authority = ctx.accounts.authority.key();
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        // 1. Transfer SOL from User to Vault PDA
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.vault_pda.to_account_info(),
            },
        );
        system_program::transfer(cpi_context, amount)?;

        // 2. Update State
        let vault_state = &mut ctx.accounts.vault_state;
        vault_state.total_deposited += amount;
        vault_state.batch_count += 1;

        // 3. Emit Event for Helios
        emit!(DepositEvent {
            user: ctx.accounts.user.key(),
            amount,
            total_deposited: vault_state.total_deposited,
            batch_count: vault_state.batch_count,
        });

        msg!("Deposit successful. Total: {}", vault_state.total_deposited);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 8 + 8 + 32, // Discriminator + u64 + u64 + Pubkey
        seeds = [b"vault_state"],
        bump
    )]
    pub vault_state: Account<'info, VaultState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub vault_state: Account<'info, VaultState>,
    
    /// CHECK: This is the PDA that holds the SOL. It doesn't need data, just lamports.
    #[account(
        mut,
        seeds = [b"vault_pda"],
        bump
    )]
    pub vault_pda: AccountInfo<'info>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct VaultState {
    pub total_deposited: u64,
    pub batch_count: u64,
    pub authority: Pubkey,
}

#[event]
pub struct DepositEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub total_deposited: u64,
    pub batch_count: u64,
}