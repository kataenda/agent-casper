use yield_vault::YieldVault;

fn main() {
    odra::schema::schema_installer::install_schema::<YieldVault>("yield_vault");
}
