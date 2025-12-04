use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::{CircuitSource, OffChainCircuitSource};

const COMP_DEF_OFFSET_GENERATE_RANDOM: u32 = comp_def_offset("generate_random");

const CIRCUIT_URL: &str = "https://izromwpjybfzjqbkstqo.supabase.co/storage/v1/object/public/new/generate_random.arcis";

declare_id!("3khnFsWgLNsJoWtpzmhmc8J7ckDJxQu2ibZY58K7ZvRT");

#[arcium_program]
pub mod randomizer {
    use super::*;

    /// Initializes the computation definition for random number generation using the offchain circuit.
    pub fn init_generate_random_comp_def(ctx: Context<InitGenerateRandomCompDef>) -> Result<()> {
        init_comp_def(
            ctx.accounts,
            0,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: CIRCUIT_URL.to_string(),
                hash: [0; 32],
            })),
            None,
        )?;
        Ok(())
    }

    /// Queues an MPC request to generate a random number in the range [min, max].
    pub fn generate_random(
        ctx: Context<GenerateRandom>,
        computation_offset: u64,
        min: u64,
        max: u64,
    ) -> Result<()> {
        let args = vec![
            Argument::PlaintextU64(min),
            Argument::PlaintextU64(max),
        ];

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![GenerateRandomCallback::callback_ix(&[])],
            1,
        )?;

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "generate_random")]
    pub fn generate_random_callback(
        ctx: Context<GenerateRandomCallback>,
        output: ComputationOutputs<GenerateRandomOutput>,
    ) -> Result<()> {
        let o = match output {
            ComputationOutputs::Success(GenerateRandomOutput { field_0 }) => field_0,
            _ => return Err(ErrorCode::AbortedComputation.into()),
        };

        emit!(GenerateRandomEvent { result: o });

        Ok(())
    }
}

#[queue_computation_accounts("generate_random", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct GenerateRandom<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(
        mut,
        address = derive_mempool_pda!()
    )]
    /// CHECK: mempool_account, checked by the arcium program
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!()
    )]
    /// CHECK: executing_pool, checked by the arcium program
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_GENERATE_RANDOM)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,
    #[account(
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS,
    )]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("generate_random")]
#[derive(Accounts)]
pub struct GenerateRandomCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET_GENERATE_RANDOM)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
}

#[init_computation_definition_accounts("generate_random", payer)]
#[derive(Accounts)]
pub struct InitGenerateRandomCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    /// Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct GenerateRandomEvent {
    pub result: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("The cluster is not set")]
    ClusterNotSet,
}
