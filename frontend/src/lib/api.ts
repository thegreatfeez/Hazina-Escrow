const BASE = '/api';

export interface DatasetMeta {
  id: string;
  name: string;
  description: string;
  type: string;
  pricePerQuery: number;
  sellerWallet: string;
  queriesServed: number;
  totalEarned: number;
  createdAt: string;
}

export interface Transaction {
  id: string;
  datasetId: string;
  txHash: string;
  amount: number;
  buyerQuery?: string;
  aiSummary?: string;
  timestamp: string;
}

export interface Stats {
  totalDatasets: number;
  totalQueries: number;
  totalUsdcEarned: number;
  totalTransactions: number;
}

export interface QueryResult {
  success: boolean;
  demo?: boolean;
  data: Record<string, unknown>;
  ai: { summary: string; answer?: string };
  transaction: {
    hash: string;
    amount: number;
    sellerReceived: number;
    platformFee: number;
  };
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Network error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getDatasets: () =>
    request<{ success: boolean; datasets: DatasetMeta[] }>(`${BASE}/datasets`).then(
      (r) => r.datasets
    ),

  getStats: () =>
    request<{ success: boolean; stats: Stats }>(`${BASE}/datasets/stats`).then((r) => r.stats),

  getDataset: (id: string) =>
    request<{ success: boolean; dataset: DatasetMeta }>(`${BASE}/datasets/${id}`).then(
      (r) => r.dataset
    ),

  getTransactions: (datasetId?: string) => {
    const url = datasetId
      ? `${BASE}/datasets/${datasetId}/transactions`
      : `${BASE}/datasets/transactions`;
    return request<{ success: boolean; transactions: Transaction[] }>(url).then(
      (r) => r.transactions
    );
  },

  initiateQuery: (id: string) =>
    fetch(`${BASE}/query/${id}`, { method: 'POST' }).then((r) => r.json()),

  verifyPayment: (id: string, txHash: string, buyerQuestion?: string) =>
    request<QueryResult>(`${BASE}/verify/${id}`, {
      method: 'POST',
      body: JSON.stringify({ txHash, buyerQuestion }),
    }),

  demoQuery: (id: string, buyerQuestion?: string) =>
    request<QueryResult>(`${BASE}/verify/${id}/demo`, {
      method: 'POST',
      body: JSON.stringify({ buyerQuestion }),
    }),

  createDataset: (payload: {
    name: string;
    description: string;
    type: string;
    pricePerQuery: number;
    sellerWallet: string;
    data: unknown;
  }) =>
    request<{ success: boolean; dataset: DatasetMeta }>(`${BASE}/datasets`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then((r) => r.dataset),
};
