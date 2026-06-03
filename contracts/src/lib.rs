#![cfg_attr(target_arch = "wasm32", no_std)]

pub mod yield_vault;
pub use yield_vault::YieldVault;
