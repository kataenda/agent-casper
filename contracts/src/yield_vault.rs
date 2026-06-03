use odra::prelude::*;
use odra::casper_types::U512;

/// Strategy enum: defines available yield strategies
#[odra::odra_type]
#[derive(Clone, PartialEq)]
pub enum Strategy {
    Conservative,   // Low risk, lower yield
    Balanced,       // Medium risk/reward
    Aggressive,     // High risk, higher yield
}

/// Represents a single rebalance action taken by the agent
#[odra::odra_type]
pub struct RebalanceRecord {
    pub timestamp: u64,
    pub from_strategy: Strategy,
    pub to_strategy: Strategy,
    pub agent_reasoning: String,
    pub tx_executor: Address,
}

/// Portfolio snapshot
#[odra::odra_type]
pub struct Portfolio {
    pub total_value: U512,
    pub conservative_pct: u8,
    pub balanced_pct: u8,
    pub aggressive_pct: u8,
    pub current_strategy: Strategy,
    pub last_rebalance: u64,
}

/// YieldVault Events
#[odra::event]
pub struct Deposited {
    pub depositor: Address,
    pub amount: U512,
    pub timestamp: u64,
}

#[odra::event]
pub struct Withdrawn {
    pub withdrawer: Address,
    pub amount: U512,
    pub timestamp: u64,
}

#[odra::event]
pub struct Rebalanced {
    pub from_strategy: Strategy,
    pub to_strategy: Strategy,
    pub agent: Address,
    pub timestamp: u64,
}

#[odra::event]
pub struct AgentRegistered {
    pub agent: Address,
}

#[odra::event]
pub struct EmergencyPaused {
    pub by: Address,
    pub timestamp: u64,
}

/// Emitted when the AI agent posts a verified RWA price on-chain
#[odra::event]
pub struct RwaPriceUpdated {
    pub asset_id:       String,   // e.g. "PAXG", "UST10Y", "WTI"
    pub price_usd_cents: u64,     // price * 100  (e.g. 208050 = $2,080.50)
    pub yield_bps:       u16,     // yield in basis points (UST10Y: 422 = 4.22%)
    pub timestamp:       u64,
    pub reporter:        Address,
}

/// YieldVault — main smart contract
/// Manages deposits, AI-agent-driven yield rebalancing, and on-chain RWA price oracle
#[odra::module(events = [Deposited, Withdrawn, Rebalanced, AgentRegistered, EmergencyPaused, RwaPriceUpdated])]
pub struct YieldVault {
    owner: Var<Address>,
    agent: Var<Address>,
    paused: Var<bool>,

    // Balances per depositor
    balances: Mapping<Address, U512>,
    total_deposited: Var<U512>,

    // Strategy state
    current_strategy: Var<Strategy>,
    conservative_pct: Var<u8>,
    balanced_pct: Var<u8>,
    aggressive_pct: Var<u8>,

    // Simulated APY per strategy (basis points: 100 = 1%)
    conservative_apy: Var<u16>,
    balanced_apy: Var<u16>,
    aggressive_apy: Var<u16>,

    // Rebalance history (last 10 entries stored as index)
    rebalance_count: Var<u64>,
    rebalance_records: Mapping<u64, RebalanceRecord>,

    // RWA Oracle — on-chain price storage posted by AI agent
    // key: asset_id string  (e.g. "PAXG", "UST10Y", "WTI")
    // value: price in USD cents
    rwa_prices: Mapping<String, u64>,
    // yield in basis points for fixed-income assets
    rwa_yields: Mapping<String, u16>,
}

#[odra::module]
impl YieldVault {
    /// Initialize the vault
    pub fn init(&mut self) {
        let caller = self.env().caller();
        self.owner.set(caller);
        self.paused.set(false);
        self.total_deposited.set(U512::zero());

        // Default strategy: Balanced
        self.current_strategy.set(Strategy::Balanced);
        self.conservative_pct.set(30);
        self.balanced_pct.set(50);
        self.aggressive_pct.set(20);

        // Default APY in basis points
        self.conservative_apy.set(300);   // 3%
        self.balanced_apy.set(700);       // 7%
        self.aggressive_apy.set(1500);    // 15%

        self.rebalance_count.set(0);
    }

    /// Owner: register AI agent address
    pub fn register_agent(&mut self, agent: Address) {
        self.only_owner();
        self.agent.set(agent);
        self.env().emit_event(AgentRegistered { agent });
    }

    /// Owner: update simulated APY rates (in basis points)
    pub fn update_apy(&mut self, conservative: u16, balanced: u16, aggressive: u16) {
        self.only_owner();
        self.conservative_apy.set(conservative);
        self.balanced_apy.set(balanced);
        self.aggressive_apy.set(aggressive);
    }

    /// Deposit CSPR into the vault
    #[odra(payable)]
    pub fn deposit(&mut self) {
        self.not_paused();
        let caller = self.env().caller();
        let amount = self.env().attached_value();

        require!(amount > U512::zero(), "Deposit amount must be > 0");

        let current = self.balances.get_or_default(&caller);
        self.balances.set(&caller, current + amount);

        let total = self.total_deposited.get_or_default();
        self.total_deposited.set(total + amount);

        self.env().emit_event(Deposited {
            depositor: caller,
            amount,
            timestamp: self.env().block_time(),
        });
    }

    /// Withdraw CSPR from the vault
    pub fn withdraw(&mut self, amount: U512) {
        self.not_paused();
        let caller = self.env().caller();
        let balance = self.balances.get_or_default(&caller);

        require!(balance >= amount, "Insufficient balance");

        self.balances.set(&caller, balance - amount);

        let total = self.total_deposited.get_or_default();
        self.total_deposited.set(total - amount);

        self.env().transfer_tokens(&caller, &amount);

        self.env().emit_event(Withdrawn {
            withdrawer: caller,
            amount,
            timestamp: self.env().block_time(),
        });
    }

    /// AI Agent: rebalance portfolio strategy
    /// Only callable by registered agent address
    pub fn rebalance(
        &mut self,
        new_strategy: Strategy,
        conservative_pct: u8,
        balanced_pct: u8,
        aggressive_pct: u8,
        reasoning: String,
    ) {
        self.only_agent();
        self.not_paused();

        require!(
            conservative_pct + balanced_pct + aggressive_pct == 100,
            "Percentages must sum to 100"
        );

        let old_strategy = self.current_strategy.get_or_default(Strategy::Balanced);
        let agent_addr = self.agent.get_or_revert_with("No agent registered");
        let timestamp = self.env().block_time();

        // Update allocations
        self.current_strategy.set(new_strategy.clone());
        self.conservative_pct.set(conservative_pct);
        self.balanced_pct.set(balanced_pct);
        self.aggressive_pct.set(aggressive_pct);

        // Record rebalance
        let count = self.rebalance_count.get_or_default();
        self.rebalance_records.set(
            &count,
            RebalanceRecord {
                timestamp,
                from_strategy: old_strategy.clone(),
                to_strategy: new_strategy.clone(),
                agent_reasoning: reasoning,
                tx_executor: agent_addr,
            },
        );
        self.rebalance_count.set(count + 1);

        self.env().emit_event(Rebalanced {
            from_strategy: old_strategy,
            to_strategy: new_strategy,
            agent: agent_addr,
            timestamp,
        });
    }

    // ── RWA Oracle ──────────────────────────────────────────────

    /// AI Agent: post a verified Real-World Asset price on-chain.
    /// Emits RwaPriceUpdated event — creates a transparent, auditable price feed.
    pub fn update_rwa_price(
        &mut self,
        asset_id: String,
        price_usd_cents: u64,  // price * 100 (e.g. 208050 = $2,080.50)
        yield_bps: u16,        // 0 for non-yield assets; basis points for bonds
    ) {
        self.only_agent();
        self.rwa_prices.set(&asset_id, price_usd_cents);
        self.rwa_yields.set(&asset_id, yield_bps);

        let reporter  = self.agent.get_or_revert_with("No agent registered");
        let timestamp = self.env().block_time();

        self.env().emit_event(RwaPriceUpdated {
            asset_id,
            price_usd_cents,
            yield_bps,
            timestamp,
            reporter,
        });
    }

    /// Read a stored RWA price (price in USD cents)
    pub fn get_rwa_price(&self, asset_id: String) -> u64 {
        self.rwa_prices.get_or_default(&asset_id)
    }

    /// Read a stored RWA yield (basis points)
    pub fn get_rwa_yield(&self, asset_id: String) -> u16 {
        self.rwa_yields.get_or_default(&asset_id)
    }

    /// Emergency pause — only owner
    pub fn emergency_pause(&mut self) {
        self.only_owner();
        self.paused.set(true);
        self.env().emit_event(EmergencyPaused {
            by: self.env().caller(),
            timestamp: self.env().block_time(),
        });
    }

    /// Resume after pause
    pub fn resume(&mut self) {
        self.only_owner();
        self.paused.set(false);
    }

    // ── View functions ──────────────────────────────────────────

    pub fn get_balance(&self, account: Address) -> U512 {
        self.balances.get_or_default(&account)
    }

    pub fn get_total_deposited(&self) -> U512 {
        self.total_deposited.get_or_default()
    }

    pub fn get_portfolio(&self) -> Portfolio {
        Portfolio {
            total_value: self.total_deposited.get_or_default(),
            conservative_pct: self.conservative_pct.get_or_default(),
            balanced_pct: self.balanced_pct.get_or_default(),
            aggressive_pct: self.aggressive_pct.get_or_default(),
            current_strategy: self.current_strategy.get_or_default(Strategy::Balanced),
            last_rebalance: self
                .rebalance_records
                .get(&(self.rebalance_count.get_or_default().saturating_sub(1)))
                .map(|r| r.timestamp)
                .unwrap_or(0),
        }
    }

    pub fn get_apy_rates(&self) -> (u16, u16, u16) {
        (
            self.conservative_apy.get_or_default(),
            self.balanced_apy.get_or_default(),
            self.aggressive_apy.get_or_default(),
        )
    }

    pub fn get_rebalance_count(&self) -> u64 {
        self.rebalance_count.get_or_default()
    }

    pub fn get_rebalance_record(&self, index: u64) -> Option<RebalanceRecord> {
        self.rebalance_records.get(&index)
    }

    pub fn is_paused(&self) -> bool {
        self.paused.get_or_default()
    }

    pub fn get_agent(&self) -> Option<Address> {
        self.agent.get()
    }

    // ── Internal guards ─────────────────────────────────────────

    fn only_owner(&self) {
        let owner = self.owner.get_or_revert_with("No owner set");
        require!(self.env().caller() == owner, "Caller is not the owner");
    }

    fn only_agent(&self) {
        let agent = self.agent.get_or_revert_with("No agent registered");
        require!(self.env().caller() == agent, "Caller is not the registered agent");
    }

    fn not_paused(&self) {
        require!(!self.paused.get_or_default(), "Vault is paused");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostRef, NoArgs};

    #[test]
    fn test_deposit_and_withdraw() {
        let env = odra_test::env();
        let mut vault = YieldVaultHostRef::deploy(&env, NoArgs);
        let alice = env.get_account(1);

        env.set_caller(alice);
        vault.deposit(1_000_000_000u64.into()); // 1 CSPR

        assert_eq!(vault.get_balance(alice), U512::from(1_000_000_000u64));
        assert_eq!(vault.get_total_deposited(), U512::from(1_000_000_000u64));

        vault.withdraw(U512::from(500_000_000u64));
        assert_eq!(vault.get_balance(alice), U512::from(500_000_000u64));
    }

    #[test]
    fn test_agent_rebalance() {
        let env = odra_test::env();
        let mut vault = YieldVaultHostRef::deploy(&env, NoArgs);
        let owner = env.get_account(0);
        let agent = env.get_account(1);

        env.set_caller(owner);
        vault.register_agent(agent);

        env.set_caller(agent);
        vault.rebalance(
            Strategy::Aggressive,
            10,
            30,
            60,
            "High yield opportunity detected — APY spread favors aggressive allocation".to_string(),
        );

        let portfolio = vault.get_portfolio();
        assert_eq!(portfolio.current_strategy, Strategy::Aggressive);
        assert_eq!(portfolio.aggressive_pct, 60);
        assert_eq!(vault.get_rebalance_count(), 1);
    }

    #[test]
    fn test_emergency_pause() {
        let env = odra_test::env();
        let mut vault = YieldVaultHostRef::deploy(&env, NoArgs);
        let owner = env.get_account(0);
        let alice = env.get_account(1);

        env.set_caller(owner);
        vault.emergency_pause();

        env.set_caller(alice);
        // Should revert because paused
        assert!(vault.try_deposit(U512::from(1_000_000_000u64)).is_err());
    }
}
