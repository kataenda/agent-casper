use odra::prelude::*;
use odra::casper_types::U512;

#[odra::odra_error]
pub enum VaultError {
    ZeroDeposit         = 1,
    InsufficientBalance = 2,
    InvalidAllocation   = 3,
    NotOwner            = 10,
    NotAgent            = 11,
    Paused              = 12,
}

#[odra::odra_type]
pub enum Strategy {
    Conservative,
    Balanced,
    Aggressive,
}

impl Default for Strategy {
    fn default() -> Self { Strategy::Balanced }
}

#[odra::odra_type]
pub struct RebalanceRecord {
    pub timestamp:       u64,
    pub from_strategy:   Strategy,
    pub to_strategy:     Strategy,
    pub agent_reasoning: String,
    pub tx_executor:     Address,
}

#[odra::odra_type]
pub struct Portfolio {
    pub total_value:      U512,
    pub conservative_pct: u8,
    pub balanced_pct:     u8,
    pub aggressive_pct:   u8,
    pub current_strategy: Strategy,
    pub last_rebalance:   u64,
}

#[odra::event]
pub struct Deposited      { pub depositor: Address, pub amount: U512, pub timestamp: u64 }
#[odra::event]
pub struct Withdrawn      { pub withdrawer: Address, pub amount: U512, pub timestamp: u64 }
#[odra::event]
pub struct Rebalanced     { pub from_strategy: Strategy, pub to_strategy: Strategy, pub agent: Address, pub timestamp: u64 }
#[odra::event]
pub struct AgentRegistered { pub agent: Address }
#[odra::event]
pub struct EmergencyPaused { pub by: Address, pub timestamp: u64 }
#[odra::event]
pub struct RwaPriceUpdated { pub asset_id: String, pub price_usd_cents: u64, pub yield_bps: u32, pub timestamp: u64, pub reporter: Address }

// 14 fields (Odra limit = 15)
#[odra::module(events = [Deposited, Withdrawn, Rebalanced, AgentRegistered, EmergencyPaused, RwaPriceUpdated])]
pub struct YieldVault {
    owner:             Var<Address>,
    agent:             Var<Address>,
    paused:            Var<bool>,
    balances:          Mapping<Address, U512>,
    total_deposited:   Var<U512>,
    current_strategy:  Var<Strategy>,
    conservative_pct:  Var<u8>,
    balanced_pct:      Var<u8>,
    aggressive_pct:    Var<u8>,
    conservative_apy:  Var<u32>,
    balanced_apy:      Var<u32>,
    aggressive_apy:    Var<u32>,
    rebalance_count:   Var<u64>,
    rebalance_records: Mapping<u64, RebalanceRecord>,
}

#[odra::module]
impl YieldVault {
    pub fn init(&mut self) {
        let caller = self.env().caller();
        self.owner.set(caller);
        self.paused.set(false);
        self.total_deposited.set(U512::zero());
        self.current_strategy.set(Strategy::Balanced);
        self.conservative_pct.set(30);
        self.balanced_pct.set(50);
        self.aggressive_pct.set(20);
        self.conservative_apy.set(300);
        self.balanced_apy.set(700);
        self.aggressive_apy.set(1500);
        self.rebalance_count.set(0);
    }

    pub fn register_agent(&mut self, agent: Address) {
        self.only_owner();
        self.agent.set(agent);
        self.env().emit_event(AgentRegistered { agent });
    }

    pub fn update_apy(&mut self, conservative: u32, balanced: u32, aggressive: u32) {
        self.only_owner();
        self.conservative_apy.set(conservative);
        self.balanced_apy.set(balanced);
        self.aggressive_apy.set(aggressive);
    }

    #[odra(payable)]
    pub fn deposit(&mut self) {
        self.not_paused();
        let caller = self.env().caller();
        let amount = self.env().attached_value();
        if amount == U512::zero() { self.env().revert(VaultError::ZeroDeposit); }
        let current = self.balances.get_or_default(&caller);
        self.balances.set(&caller, current + amount);
        let total = self.total_deposited.get_or_default();
        self.total_deposited.set(total + amount);
        self.env().emit_event(Deposited { depositor: caller, amount, timestamp: self.env().get_block_time() });
    }

    pub fn withdraw(&mut self, amount: U512) {
        self.not_paused();
        let caller  = self.env().caller();
        let balance = self.balances.get_or_default(&caller);
        if balance < amount { self.env().revert(VaultError::InsufficientBalance); }
        self.balances.set(&caller, balance - amount);
        let total = self.total_deposited.get_or_default();
        self.total_deposited.set(total - amount);
        self.env().transfer_tokens(&caller, &amount);
        self.env().emit_event(Withdrawn { withdrawer: caller, amount, timestamp: self.env().get_block_time() });
    }

    pub fn rebalance(
        &mut self,
        new_strategy:     Strategy,
        conservative_pct: u8,
        balanced_pct:     u8,
        aggressive_pct:   u8,
        reasoning:        String,
    ) {
        self.only_agent();
        self.not_paused();
        if conservative_pct + balanced_pct + aggressive_pct != 100 {
            self.env().revert(VaultError::InvalidAllocation);
        }
        let old_strategy = self.current_strategy.get_or_default();
        let agent_addr   = self.agent.get().unwrap_or_revert(&self.env());
        let timestamp    = self.env().get_block_time();
        self.current_strategy.set(new_strategy.clone());
        self.conservative_pct.set(conservative_pct);
        self.balanced_pct.set(balanced_pct);
        self.aggressive_pct.set(aggressive_pct);
        let count = self.rebalance_count.get_or_default();
        self.rebalance_records.set(&count, RebalanceRecord {
            timestamp,
            from_strategy:   old_strategy.clone(),
            to_strategy:     new_strategy.clone(),
            agent_reasoning: reasoning,
            tx_executor:     agent_addr,
        });
        self.rebalance_count.set(count + 1);
        self.env().emit_event(Rebalanced {
            from_strategy: old_strategy,
            to_strategy:   new_strategy,
            agent:         agent_addr,
            timestamp,
        });
    }

    pub fn update_rwa_price(&mut self, asset_id: String, price_usd_cents: u64, yield_bps: u32) {
        self.only_agent();
        let reporter  = self.agent.get().unwrap_or_revert(&self.env());
        let timestamp = self.env().get_block_time();
        self.env().emit_event(RwaPriceUpdated { asset_id, price_usd_cents, yield_bps, timestamp, reporter });
    }

    pub fn emergency_pause(&mut self) {
        self.only_owner();
        self.paused.set(true);
        self.env().emit_event(EmergencyPaused { by: self.env().caller(), timestamp: self.env().get_block_time() });
    }

    pub fn resume(&mut self) {
        self.only_owner();
        self.paused.set(false);
    }

    pub fn get_balance(&self, account: Address) -> U512 { self.balances.get_or_default(&account) }
    pub fn get_total_deposited(&self) -> U512 { self.total_deposited.get_or_default() }
    pub fn get_rebalance_count(&self) -> u64 { self.rebalance_count.get_or_default() }
    pub fn is_paused(&self) -> bool { self.paused.get_or_default() }
    pub fn get_agent(&self) -> Option<Address> { self.agent.get() }

    pub fn get_portfolio(&self) -> Portfolio {
        let count = self.rebalance_count.get_or_default();
        Portfolio {
            total_value:      self.total_deposited.get_or_default(),
            conservative_pct: self.conservative_pct.get_or_default(),
            balanced_pct:     self.balanced_pct.get_or_default(),
            aggressive_pct:   self.aggressive_pct.get_or_default(),
            current_strategy: self.current_strategy.get_or_default(),
            last_rebalance:   self.rebalance_records
                .get(&count.saturating_sub(1))
                .map(|r| r.timestamp)
                .unwrap_or(0),
        }
    }

    fn only_owner(&self) {
        let owner = self.owner.get().unwrap_or_revert(&self.env());
        if self.env().caller() != owner { self.env().revert(VaultError::NotOwner); }
    }

    fn only_agent(&self) {
        let agent = self.agent.get().unwrap_or_revert(&self.env());
        if self.env().caller() != agent { self.env().revert(VaultError::NotAgent); }
    }

    fn not_paused(&self) {
        if self.paused.get_or_default() { self.env().revert(VaultError::Paused); }
    }
}

