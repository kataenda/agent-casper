#![no_std]
#![no_main]

// This binary is compiled by `cargo odra build -b casper`.
// Importing the crate root triggers Odra's proc-macros to emit the
// `call` WASM export that Casper runtime requires.
extern crate yield_vault;
