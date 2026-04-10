import fs from 'fs';
import path from 'path';

const DATA_PATH = path.join(__dirname, '../../../data/datasets.json');

export interface Dataset {
  id: string;
  name: string;
  description: string;
  type: string;
  pricePerQuery: number;
  sellerWallet: string;
  data: Record<string, unknown>;
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

export interface Store {
  datasets: Dataset[];
  transactions: Transaction[];
}

export function readStore(): Store {
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  return JSON.parse(raw) as Store;
}

export function writeStore(store: Store): void {
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

export function getDataset(id: string): Dataset | undefined {
  return readStore().datasets.find((d) => d.id === id);
}

export function getAllDatasets(): Dataset[] {
  return readStore().datasets;
}

export function updateDataset(id: string, updates: Partial<Dataset>): Dataset | null {
  const store = readStore();
  const idx = store.datasets.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  store.datasets[idx] = { ...store.datasets[idx], ...updates };
  writeStore(store);
  return store.datasets[idx];
}

export function addDataset(dataset: Dataset): void {
  const store = readStore();
  store.datasets.push(dataset);
  writeStore(store);
}

export function addTransaction(tx: Transaction): void {
  const store = readStore();
  store.transactions.push(tx);
  writeStore(store);
}

export function getTransactions(datasetId?: string): Transaction[] {
  const store = readStore();
  if (datasetId) return store.transactions.filter((t) => t.datasetId === datasetId);
  return store.transactions;
}

export function txHashUsed(txHash: string): boolean {
  return readStore().transactions.some((t) => t.txHash === txHash);
}
