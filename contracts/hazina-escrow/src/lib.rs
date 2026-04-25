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
    ) -> Result<u64, Error> {
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

        Ok(id)
    }

    pub fn lock_multi(
        env: Env,
        buyer: Address,
        token: Address,
        shares: Vec<SellerShare>,
        dataset_ids: Vec<String>,
    ) -> Result<u64, Error> {
        buyer.require_auth();

        if shares.is_empty() || shares.len() != dataset_ids.len() {
            return Err(Error::InvalidInput);
        }

        let first_id: u64 = env.storage().instance().get(&DataKey::EscrowCount).unwrap_or(0);
        let mut total_amount: i128 = 0;

        let mut i: u32 = 0;
        while i < shares.len() {
            let share = match shares.get(i) {
                Some(share) => share,
                None => return Err(Error::InvalidInput),
            };
            total_amount += share.amount;
            i += 1;
        }

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&buyer, &env.current_contract_address(), &total_amount);

        let mut next_id = first_id;
        let mut j: u32 = 0;
        while j < shares.len() {
            let share = match shares.get(j) {
                Some(share) => share,
                None => return Err(Error::InvalidInput),
            };
            let dataset_id = match dataset_ids.get(j) {
                Some(dataset_id) => dataset_id,
                None => return Err(Error::InvalidInput),
            };
            let record = EscrowRecord {
                escrow_id: next_id,
                dataset_id,
                buyer: buyer.clone(),
                seller: share.seller,
                amount: share.amount,
                token: token.clone(),
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
        admin.require_auth();
        Self::assert_admin(&env, &admin)?;
        Self::release_one(&env, &admin, escrow_id)
    }

    pub fn release_multi(env: Env, admin: Address, escrow_ids: Vec<u64>) -> Result<(), Error> {
        admin.require_auth();
        Self::assert_admin(&env, &admin)?;

        let mut i: u32 = 0;
        while i < escrow_ids.len() {
            let escrow_id = match escrow_ids.get(i) {
                Some(escrow_id) => escrow_id,
                None => return Err(Error::EscrowNotFound),
            };
            Self::release_one(&env, &admin, escrow_id)?;
            i += 1;
        }
        Ok(())
    }

    pub fn refund(env: Env, admin: Address, escrow_id: u64) -> Result<(), Error> {
        admin.require_auth();
        Self::assert_admin(&env, &admin)?;

        let mut record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&EscrowKey::Record(escrow_id))
            .ok_or(Error::EscrowNotFound)?;

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
        Ok(())
    }

    pub fn get_escrow(env: Env, escrow_id: u64) -> Result<EscrowRecord, Error> {
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
    }

    fn release_one(env: &Env, admin: &Address, escrow_id: u64) -> Result<(), Error> {
        let mut record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&EscrowKey::Record(escrow_id))
            .ok_or(Error::EscrowNotFound)?;

        if record.released {
            return Err(Error::AlreadyReleased);
        }
        if record.refunded {
            return Err(Error::AlreadyRefunded);
        }

        let fee_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::PlatformFee)
            .unwrap_or(500);

        let platform_cut = record.amount * fee_bps as i128 / 10_000;
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
        Ok(())
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
    }
}