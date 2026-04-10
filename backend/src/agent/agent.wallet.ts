import * as StellarSdk from '@stellar/stellar-sdk';

const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');

// Testnet USDC issuer (Circle testnet)
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

export interface SendPaymentParams {
  destinationAddress: string;
  amount: string; // string to match Stellar SDK precision
  memo?: string;
}

export interface SendPaymentResult {
  txHash: string;
  from: string;
  to: string;
  amount: string;
}

/**
 * Sends USDC from the agent's own wallet to a data seller.
 * Requires AGENT_WALLET_SECRET in env.
 */
export async function sendUsdcPayment(params: SendPaymentParams): Promise<SendPaymentResult> {
  const secret = process.env.AGENT_WALLET_SECRET;
  if (!secret) {
    throw new Error('AGENT_WALLET_SECRET not configured — agent cannot send payments');
  }

  const keypair = StellarSdk.Keypair.fromSecret(secret);
  const account = await server.loadAccount(keypair.publicKey());

  const usdc = new StellarSdk.Asset('USDC', USDC_ISSUER);

  const txBuilder = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  }).addOperation(
    StellarSdk.Operation.payment({
      destination: params.destinationAddress,
      asset: usdc,
      amount: params.amount,
    })
  );

  if (params.memo) {
    txBuilder.addMemo(StellarSdk.Memo.text(params.memo.slice(0, 28))); // Stellar memo max 28 bytes
  }

  const tx = txBuilder.setTimeout(30).build();
  tx.sign(keypair);

  const result = await server.submitTransaction(tx);
  return {
    txHash: result.hash,
    from: keypair.publicKey(),
    to: params.destinationAddress,
    amount: params.amount,
  };
}

export function getAgentPublicKey(): string | null {
  const secret = process.env.AGENT_WALLET_SECRET;
  if (!secret) return null;
  try {
    return StellarSdk.Keypair.fromSecret(secret).publicKey();
  } catch {
    return null;
  }
}
