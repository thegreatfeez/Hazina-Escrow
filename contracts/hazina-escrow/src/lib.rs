#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env, String, Vec,
};

#[contracttype]
pub enum DataKey {
    Admin,
    PlatformFee,
    EscrowCount,
}

#[contracttype]
pub enum EscrowKey {
    Record(u64),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    AlreadyInitialised = 1,
    NotAdmin = 2,
    EscrowNotFound = 3,
    AlreadyReleased = 4,
    AlreadyRefunded = 5,
    NotBuyer = 6,
    NotExpired = 7,
    InvalidInput = 8,
}

#[contracttype]
#[derive(Clone)]
pub struct EscrowRecord {
    pub escrow_id: u64,
    pub dataset_id: String,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub token: Address,
    pub released: bool,
    pub refunded: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct SellerShare {
    pub seller: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Eq, PartialEq)]
pub struct SellerShare {
    pub seller: Address,
    pub amount: i128,
}

#[contract]
pub struct HazinaEscrow;

#[contractimpl]
impl HazinaEscrow {
    pub fn initialize(env: Env, admin: Address, platform_fee_bps: u32) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialised);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PlatformFee, &platform_fee_bps);
        env.storage().instance().set(&DataKey::EscrowCount, &0u64);
        Ok(())
    }

    /// Transfer admin role to a new address. Only current admin can call.
    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) {
        admin.require_auth();
        Self::assert_admin(&env, &admin);
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        env.events().publish((soroban_sdk::symbol_short!("admin"),), (new_admin,));
    }

    /// Update platform fee (max 1000 bps = 10%). Only admin.
    pub fn update_fee(env: Env, admin: Address, new_fee_bps: u32) {
        admin.require_auth();
        Self::assert_admin(&env, &admin);
        assert!(new_fee_bps <= 1_000, "fee too high");
        env.storage().instance().set(&DataKey::DefaultPlatformFee, &new_fee_bps);
        env.events().publish((soroban_sdk::symbol_short!("fee_upd"),), (admin, new_fee_bps));
    }

    pub fn set_dataset_fee(env: Env, admin: Address, dataset_id: String, fee_bps: u32) {
        admin.require_auth();
        Self::assert_admin(&env, &admin);
        Self::assert_valid_dataset_id(&env, &dataset_id);
        Self::assert_valid_fee(&env, fee_bps);

        env.storage()
            .persistent()
            .set(&DataKey::DatasetFee(dataset_id.clone()), &fee_bps);

        env.storage().instance().set(&DataKey::Admin, &new_admin);
        env.events().publish(
            (String::from_str(&env, "admin_changed"),),
            (current_admin, new_admin),
        );
        Ok(())
    }

    // fix.md: update fee with cap at 10% (1000 bps)
    pub fn update_fee(env: Env, admin: Address, new_fee_bps: u32) -> Result<(), Error> {
        admin.require_auth();
        Self::assert_admin(&env, &admin)?;
        if new_fee_bps > 1000 {
            return Err(Error::InvalidInput);
        }

        let old_fee = Self::get_fee(env.clone());
        env.storage().instance().set(&DataKey::PlatformFee, &new_fee_bps);
        env.events().publish(
            (String::from_str(&env, "fee_updated"),),
            (old_fee, new_fee_bps),
        );
        Ok(())
    }

    pub fn lock(
        env: Env,
        buyer: Address,
        seller: Address,
        token: Address,
        amount: i128,
        dataset_id: String,
    ) -> u64 {
        buyer.require_auth();

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&buyer, &env.current_contract_address(), &amount);

        let id: u64 = env.storage().instance().get(&DataKey::EscrowCount).unwrap_or(0);
        let record = EscrowRecord {
            escrow_id: id,
            dataset_id,
            buyer: buyer.clone(),
            seller: seller.clone(),
            amount,
            token: token.clone(),
            released: false,
            refunded: false,
        };
        env.storage().persistent().set(&EscrowKey::Record(id), &record);
        env.storage().instance().set(&DataKey::EscrowCount, &(id + 1));

        env.events().publish(
            (soroban_sdk::symbol_short!("locked"),),
            (id, buyer, seller, amount),
        );

        escrow_id
    }

    pub fn lock_multi(
        env: Env,
        buyer: Address,
        token: Address,
        shares: Vec<SellerShare>,
        dataset_ids: Vec<String>,
    ) -> u64 {
        buyer.require_auth();
        if shares.is_empty() || shares.len() != dataset_ids.len() {
            panic_with_error!(&env, HazinaEscrowError::EscrowNotFound);
        }

        Self::require_operational_address(&env, &buyer);

        let mut total_amount: i128 = 0;
        let mut i: u32 = 0;
        while i < shares.len() {
            let share = shares
                .get(i)
                .unwrap_or_else(|| panic_with_error!(&env, HazinaEscrowError::EscrowNotFound));
            Self::assert_valid_amount(&env, share.amount);
            Self::require_operational_address(&env, &share.seller);
            total_amount += share.amount;
            i += 1;
        }

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&buyer, &env.current_contract_address(), &total_amount);

        let first_id: u64 = env.storage().instance().get(&DataKey::EscrowCount).unwrap_or(0);
        let mut next_id = first_id;
        let mut j: u32 = 0;
        while j < shares.len() {
            let share = shares
                .get(j)
                .unwrap_or_else(|| panic_with_error!(&env, HazinaEscrowError::EscrowNotFound));
            let dataset_id = dataset_ids
                .get(j)
                .unwrap_or_else(|| panic_with_error!(&env, HazinaEscrowError::EscrowNotFound));
            Self::assert_valid_dataset_id(&env, &dataset_id);
            let fee_bps = Self::resolve_fee_bps(&env, &dataset_id);

            let record = EscrowRecord {
                escrow_id: next_id,
                dataset_id,
                buyer: buyer.clone(),
                seller: share.seller,
                amount: share.amount,
                token: token.clone(),
                platform_fee_bps: fee_bps,
                released: false,
                refunded: false,
            };
            env.storage()
                .persistent()
                .set(&EscrowKey::Record(next_id), &record);
            next_id += 1;
            j += 1;
        }

        env.storage().instance().set(&DataKey::EscrowCount, &next_id);

        env.events().publish(
            (String::from_str(&env, "locked_multi"),),
            (first_id, buyer, total_amount, shares.len()),
        );

        Ok(first_id)
    }

    pub fn release(env: Env, admin: Address, escrow_id: u64) -> Result<(), Error> {
        first_id
    }

    pub fn release(env: Env, admin: Address, escrow_id: u64) {
        admin.require_auth();
        Self::assert_admin(&env, &admin);
        Self::release_one(&env, &admin, escrow_id);
    }

    pub fn release_multi(env: Env, admin: Address, escrow_ids: Vec<u64>) -> Result<(), Error> {
        admin.require_auth();
        Self::assert_admin(&env, &admin);

        let mut i: u32 = 0;
        while i < escrow_ids.len() {
            let escrow_id = escrow_ids
                .get(i)
                .unwrap_or_else(|| panic_with_error!(&env, HazinaEscrowError::EscrowNotFound));
            Self::release_one(&env, &admin, escrow_id);
            i += 1;
        }
    }

    pub fn refund(env: Env, admin: Address, escrow_id: u64) -> Result<(), Error> {
        admin.require_auth();
        Self::assert_admin(&env, &admin);

        if record.released {
            return Err(Error::AlreadyReleased);
        }
        if record.refunded {
            return Err(Error::AlreadyRefunded);
        }

        let token_client = token::Client::new(&env, &record.token);
        token_client.transfer(&env.current_contract_address(), &record.buyer, &record.amount);

        record.refunded = true;
        env.storage().persistent().set(&EscrowKey::Record(escrow_id), &record);

        env.events().publish(
            (soroban_sdk::symbol_short!("refunded"),),
            (escrow_id, record.buyer, record.amount),
        );
    }

    pub fn get_escrow(env: Env, escrow_id: u64) -> EscrowRecord {
        Self::read_escrow(&env, escrow_id)
    }

    pub fn set_fee(env: Env, admin: Address, fee_bps: u32) {
        Self::set_default_fee(env, admin, fee_bps);
    }

    pub fn set_admin(env: Env, admin: Address, new_admin: Address) {
        Self::transfer_admin(env, admin, new_admin);
    }

    fn assert_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, HazinaEscrowError::NotInitialized));
        if admin != *caller {
            panic_with_error!(env, HazinaEscrowError::NotAdmin);
        }
    }

    fn assert_valid_fee(env: &Env, fee_bps: u32) {
        if fee_bps > MAX_BASIS_POINTS {
            panic_with_error!(env, HazinaEscrowError::InvalidFeeBps);
        }
    }

    fn assert_valid_amount(env: &Env, amount: i128) {
        if amount <= 0 {
            panic_with_error!(env, HazinaEscrowError::InvalidAmount);
        }
    }

    fn assert_valid_dataset_id(env: &Env, dataset_id: &String) {
        if dataset_id.len() == 0 {
            panic_with_error!(env, HazinaEscrowError::EmptyDatasetId);
        }
    }

    fn read_escrow(env: &Env, escrow_id: u64) -> EscrowRecord {
        env.storage()
            .persistent()
            .get(&EscrowKey::Record(escrow_id))
            .ok_or(Error::EscrowNotFound)
    }

    pub fn get_fee(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::PlatformFee).unwrap_or(500)
    }

    fn assert_admin(env: &Env, caller: &Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::AlreadyInitialised)?;
        if admin != *caller {
            return Err(Error::NotAdmin);
        }
        Ok(())
    fn require_operational_address(env: &Env, address: &Address) {
        let policy = Self::get_address_policy(env.clone(), address.clone());
        if policy.blacklisted {
            panic_with_error!(env, HazinaEscrowError::AddressBlacklisted);
        }
        if policy.whitelist_enforced && !policy.whitelisted {
            panic_with_error!(env, HazinaEscrowError::AddressNotWhitelisted);
        }
    }

    fn release_one(env: &Env, admin: &Address, escrow_id: u64) {
        let mut record = Self::read_escrow(env, escrow_id);
        if record.released {
            panic_with_error!(env, HazinaEscrowError::AlreadyReleased);
        }
        if record.refunded {
            panic_with_error!(env, HazinaEscrowError::AlreadyRefunded);
        }

        let calculated_platform_cut =
            record.amount * record.platform_fee_bps as i128 / MAX_BASIS_POINTS as i128;
        let platform_cut =
            if calculated_platform_cut == 0 && record.amount > 0 && record.platform_fee_bps > 0 {
            1
        } else {
            calculated_platform_cut
        };
        let seller_cut = record.amount - platform_cut;

        let token_client = token::Client::new(env, &record.token);
        token_client.transfer(&env.current_contract_address(), &record.seller, &seller_cut);
        token_client.transfer(&env.current_contract_address(), admin, &platform_cut);

        record.released = true;
        env.storage()
            .persistent()
            .set(&EscrowKey::Record(escrow_id), &record);

        env.events().publish(
            (soroban_sdk::symbol_short!("released"),),
            (escrow_id, record.seller, seller_cut, platform_cut),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::Address as _,
        token::{Client as TokenClient, StellarAssetClient},
        Env, String,
    };

    fn setup() -> (
        Env,
        HazinaEscrowClient<'static>,
        Address,
        Address,
        Address,
        Address,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);

        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let usdc = token_id.address();
        let usdc_admin = StellarAssetClient::new(&env, &usdc);
        usdc_admin.mint(&buyer, &1_000_0000000);

        let contract_id = env.register(HazinaEscrow, ());
        let client = HazinaEscrowClient::new(&env, &contract_id);
        client.initialize(&admin, &500);

        (env, client, admin, buyer, seller, usdc)
    }

    #[test]
    fn test_lock_and_release() {
        let (env, client, admin, buyer, seller, usdc) = setup();
        let token_client = TokenClient::new(&env, &usdc);

        let amount: i128 = 2_000_000;
        let dataset_id = String::from_str(&env, "ds-003-defi-yields");

        let escrow_id = client.lock(&buyer, &seller, &usdc, &amount, &dataset_id);
        assert_eq!(escrow_id, 0);
        assert_eq!(token_client.balance(&buyer), 1_000_0000000 - amount);

        client.release(&admin, &escrow_id);
        let seller_expected = amount * 95 / 100;
        let admin_expected = amount - seller_expected;
        assert_eq!(token_client.balance(&seller), seller_expected);
        assert_eq!(token_client.balance(&admin), admin_expected);
    }

    #[test]
    fn test_refund() {
        let (env, client, admin, buyer, _seller, usdc) = setup();
    fn test_release_enforces_minimum_platform_fee_for_tiny_amounts() {
        let (env, client, admin, buyer, seller, usdc) = setup();
        let token_client = TokenClient::new(&env, &usdc);
        let amount: i128 = 9;

        let escrow_id = client.lock(
            &buyer,
            &seller,
            &usdc,
            &amount,
            &dataset_id(&env, "ds-micro-fee-floor"),
        );
        client.release(&admin, &escrow_id);

        assert_eq!(token_client.balance(&admin), 1);
        assert_eq!(token_client.balance(&seller), amount - 1);
    }

    #[test]
    #[should_panic]
    fn test_lock_rejects_blacklisted_addresses() {
        let (env, client, admin, buyer, seller, usdc) = setup();
        client.set_address_blacklisted(&admin, &seller, &true);

        client.lock(
            &buyer,
            &seller,
            &usdc,
            &1_000_000,
            &dataset_id(&env, "ds-blacklist"),
        );
    }

    #[test]
    #[should_panic]
    fn test_lock_rejects_non_whitelisted_addresses_when_enforced() {
        let (env, client, admin, buyer, seller, usdc) = setup();
        client.set_whitelist_enforced(&admin, &true);
        client.set_address_whitelisted(&admin, &buyer, &true);

        client.lock(
            &buyer,
            &seller,
            &usdc,
            &1_000_000,
            &dataset_id(&env, "ds-whitelist"),
        );
    }

    #[test]
    #[should_panic]
    fn test_lock_rejects_invalid_amount() {
        let (env, client, _admin, buyer, seller, usdc) = setup();
        client.lock(&buyer, &seller, &usdc, &0, &dataset_id(&env, "ds-invalid"));
    }

    #[test]
    fn test_refund_marks_record_and_restores_buyer_balance() {
        let (env, client, admin, buyer, seller, usdc) = setup();
        let token_client = TokenClient::new(&env, &usdc);
        let amount: i128 = 5_000_000;

        let id = client.lock(
            &buyer,
            &Address::generate(&env),
            &usdc,
            &amount,
            &String::from_str(&env, "ds-001"),
        );
        client.refund(&admin, &id);
        assert_eq!(token_client.balance(&buyer), 1_000_0000000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_transfer_admin() {
        let (env, client, admin, buyer, seller, usdc) = setup();
        let new_admin = Address::generate(&env);
        let amount: i128 = 1_000_000;

        let id = client.lock(
    #[test]
    #[should_panic]
    fn test_refund_cannot_be_called_after_release() {
        let (env, client, admin, buyer, seller, usdc) = setup();
        let escrow_id = client.lock(
            &buyer,
            &seller,
            &usdc,
            &amount,
            &String::from_str(&env, "ds-transfer"),
        );
        client.transfer_admin(&admin, &new_admin);
        client.release(&new_admin, &id);

        let id2 = client.lock(
            &buyer,
            &seller,
            &usdc,
            &amount,
            &String::from_str(&env, "ds-transfer-2"),
        );
        // old admin should fail after transfer
        client.release(&admin, &id2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_transfer_admin_unauthorized() {
        let (env, client, _admin, _buyer, _seller, _usdc) = setup();
        let impostor = Address::generate(&env);
        let new_admin = Address::generate(&env);
        client.transfer_admin(&impostor, &new_admin);
    }

    #[test]
    fn test_update_fee() {
        let (env, client, admin, buyer, seller, usdc) = setup();
        let token_client = TokenClient::new(&env, &usdc);
        let amount: i128 = 2_000_000;

        client.update_fee(&admin, &700);
        let id = client.lock(
            &buyer,
            &seller,
            &usdc,
            &amount,
            &String::from_str(&env, "ds-fee"),
        );
        client.release(&admin, &id);

        let seller_expected = amount * 93 / 100;
        let admin_expected = amount - seller_expected;
        assert_eq!(token_client.balance(&seller), seller_expected);
        assert_eq!(token_client.balance(&admin), admin_expected);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_update_fee_too_high() {
        let (_env, client, admin, _buyer, _seller, _usdc) = setup();
        client.update_fee(&admin, &1001);
    fn test_lock_multi_empty_shares() {
        let (env, client, _admin, buyer, _seller, usdc) = setup();
        let shares: Vec<SellerShare> = Vec::new(&env);
        let dataset_ids: Vec<String> = Vec::new(&env);

        let _ = client.lock_multi(&buyer, &usdc, &shares, &dataset_ids);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_lock_multi_mismatched_lengths() {
        let (env, client, _admin, buyer, _seller, usdc) = setup();
        let mut shares = Vec::new(&env);
        shares.push_back(SellerShare {
            seller: Address::generate(&env),
            amount: 1_000_000,
        });

        let dataset_ids: Vec<String> = Vec::new(&env);
        let _ = client.lock_multi(&buyer, &usdc, &shares, &dataset_ids);
    }

    #[test]
    fn test_initialize_emits_event() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);

        let contract_id = env.register(HazinaEscrow, ());
        let client = HazinaEscrowClient::new(&env, &contract_id);
        client.initialize(&admin, &250);

        let usdc_id = env.register_stellar_asset_contract_v2(admin.clone());
        let usdc = usdc_id.address();
        let usdc_admin = StellarAssetClient::new(&env, &usdc);
        usdc_admin.mint(&buyer, &1_000_0000000);

        let eurc_id = env.register_stellar_asset_contract_v2(admin.clone());
        let eurc = eurc_id.address();
        let eurc_admin = StellarAssetClient::new(&env, &eurc);
        eurc_admin.mint(&buyer, &500_0000000);

        let usdc_amount: i128 = 1_000_000;
        let eurc_amount: i128 = 500_000;

        let usdc_escrow_id = client.lock(
            &buyer,
            &seller,
            &usdc,
            &usdc_amount,
            &dataset_id(&env, "ds-usdc"),
        );
        let eurc_escrow_id = client.lock(
            &buyer,
            &seller,
            &eurc,
            &eurc_amount,
            &dataset_id(&env, "ds-eurc"),
        );

        client.release(&admin, &usdc_escrow_id);
        client.release(&admin, &eurc_escrow_id);

        let usdc_balance = TokenClient::new(&env, &usdc).balance(&seller);
        let eurc_balance = TokenClient::new(&env, &eurc).balance(&seller);
        assert_eq!(usdc_balance, usdc_amount - (usdc_amount * 250 / 10_000));
        assert_eq!(eurc_balance, eurc_amount - (eurc_amount * 250 / 10_000));
        // Fee is stored correctly after init
        assert_eq!(client.get_fee(), 250);
    }

    #[test]
    fn test_set_fee() {
        let (_, client, admin, _, _, _) = setup();
        client.set_fee(&admin, &300);
        assert_eq!(client.get_fee(), 300);
    }

    #[test]
    fn test_set_fee_max_boundary() {
        let (_, client, admin, _, _, _) = setup();
        client.set_fee(&admin, &10_000);
        assert_eq!(client.get_fee(), 10_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_set_fee_rejects_over_10000() {
        let (_, client, admin, _, _, _) = setup();
        client.set_fee(&admin, &10_001);
    }

    #[test]
    fn test_set_admin() {
        let (env, client, admin, _, _, _) = setup();
        let new_admin = Address::generate(&env);
        client.set_admin(&admin, &new_admin);

        // Old admin can no longer change the fee (new admin is required)
        // New admin can change the fee successfully
        client.set_fee(&new_admin, &100);
        assert_eq!(client.get_fee(), 100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_set_fee_requires_admin() {
        let (env, client, _, _, _, _) = setup();
        let impostor = Address::generate(&env);
        client.set_fee(&impostor, &100);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_panics() {
        let (_, client, admin, _, _, _) = setup();
        client.initialize(&admin, &500); // second call must panic
    }
}

// ─── Fuzz / property-based tests ────────────────────────────────────────────

#[cfg(test)]
mod fuzz_tests {
    extern crate std;

    use super::*;
    use proptest::prelude::*;
    use soroban_sdk::{
        testutils::Address as _,
        token::{Client as TokenClient, StellarAssetClient},
        Env, String,
    };

    // ── helpers ──────────────────────────────────────────────────────────────

    /// Mint `amount` of a fresh token to `buyer` and return the token address.
    fn deploy_token(env: &Env, admin: &Address, buyer: &Address, amount: i128) -> Address {
        let id = env.register_stellar_asset_contract_v2(admin.clone());
        let addr = id.address();
        StellarAssetClient::new(env, &addr).mint(buyer, &amount);
        addr
    }

    fn deploy_escrow(env: &Env, admin: &Address, fee_bps: u32) -> HazinaEscrowClient<'static> {
        let contract_id = env.register(HazinaEscrow, ());
        let client = HazinaEscrowClient::new(env, &contract_id);
        client.initialize(admin, &fee_bps);
        client
    }

    // ── fee arithmetic invariant ─────────────────────────────────────────────

    proptest! {
        /// For any valid fee and any positive lock amount, the split must be lossless:
        ///   seller_cut + platform_cut == amount
        #[test]
        fn prop_fee_split_is_lossless(
            fee_bps in 0u32..=10_000u32,
            amount   in 1i128..=1_000_000_000i128,
        ) {
            let platform_cut = amount * fee_bps as i128 / 10_000;
            let seller_cut   = amount - platform_cut;
            prop_assert_eq!(seller_cut + platform_cut, amount);
        }

        /// Seller cut is always <= amount and never negative.
        #[test]
        fn prop_seller_cut_in_bounds(
            fee_bps in 0u32..=10_000u32,
            amount  in 0i128..=i128::MAX / 10_001,
        ) {
            let platform_cut = amount * fee_bps as i128 / 10_000;
            let seller_cut   = amount - platform_cut;
            prop_assert!(seller_cut >= 0);
            prop_assert!(seller_cut <= amount);
        }

        /// set_fee persists arbitrary valid fee values correctly.
        #[test]
        fn prop_set_fee_roundtrip(new_fee in 0u32..=10_000u32) {
            let env = Env::default();
            env.mock_all_auths();
            let admin = Address::generate(&env);
            let client = deploy_escrow(&env, &admin, 500);
            client.set_fee(&admin, &new_fee);
            prop_assert_eq!(client.get_fee(), new_fee);
        }

        /// Lock with various amounts: contract balance increases by exactly `amount`.
        #[test]
        fn prop_lock_transfers_exact_amount(
            amount in 1i128..=500_000_000i128,
        ) {
            let env = Env::default();
            env.mock_all_auths();

            let admin  = Address::generate(&env);
            let buyer  = Address::generate(&env);
            let seller = Address::generate(&env);

            let mint_amount = amount + 1_000; // ensure buyer has enough
            let token = deploy_token(&env, &admin, &buyer, mint_amount);
            let token_client = TokenClient::new(&env, &token);

            let client = deploy_escrow(&env, &admin, 500);
            let _contract_addr = env.register(HazinaEscrow, ()); // register to get address

            let buyer_before = token_client.balance(&buyer);
            client.lock(
                &buyer, &seller, &token, &amount,
                &String::from_str(&env, "ds-fuzz"),
            );
            let buyer_after = token_client.balance(&buyer);

            prop_assert_eq!(buyer_before - buyer_after, amount);
        }

        /// Release after lock: combined payout always equals locked amount.
        #[test]
        fn prop_release_pays_out_full_amount(
            fee_bps in 0u32..=10_000u32,
            amount  in 1i128..=500_000_000i128,
        ) {
            let env = Env::default();
            env.mock_all_auths();

            let admin  = Address::generate(&env);
            let buyer  = Address::generate(&env);
            let seller = Address::generate(&env);

            let token = deploy_token(&env, &admin, &buyer, amount + 1_000);
            let token_client = TokenClient::new(&env, &token);

            let client = deploy_escrow(&env, &admin, fee_bps);
            let escrow_id = client.lock(
                &buyer, &seller, &token, &amount,
                &String::from_str(&env, "ds-fuzz-rel"),
            );

            let seller_before = token_client.balance(&seller);
            let admin_before  = token_client.balance(&admin);

            client.release(&admin, &escrow_id);

            let seller_gain = token_client.balance(&seller) - seller_before;
            let admin_gain  = token_client.balance(&admin)  - admin_before;

            prop_assert_eq!(seller_gain + admin_gain, amount);
        }

        /// Refund after lock: buyer always recovers the full locked amount.
        #[test]
        fn prop_refund_returns_full_amount(
            amount in 1i128..=500_000_000i128,
        ) {
            let env = Env::default();
            env.mock_all_auths();

            let admin  = Address::generate(&env);
            let buyer  = Address::generate(&env);
            let seller = Address::generate(&env);

            let token = deploy_token(&env, &admin, &buyer, amount + 1_000);
            let token_client = TokenClient::new(&env, &token);

            let client = deploy_escrow(&env, &admin, 500);
            let escrow_id = client.lock(
                &buyer, &seller, &token, &amount,
                &String::from_str(&env, "ds-fuzz-ref"),
            );

            let buyer_before = token_client.balance(&buyer);
            client.refund(&admin, &escrow_id);
            let buyer_after = token_client.balance(&buyer);

            prop_assert_eq!(buyer_after - buyer_before, amount);
        }
    }
}