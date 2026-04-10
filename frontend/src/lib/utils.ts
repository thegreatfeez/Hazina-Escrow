export function truncateAddress(addr: string, chars = 6): string {
  if (!addr || addr.length <= chars * 2) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

export function formatUSDC(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const DATA_TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  'whale-wallets': { label: 'Whale Wallets', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  'trading-signals': { label: 'Trading Signals', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  'yield-data': { label: 'Yield Data', color: 'text-purple-400', bg: 'bg-purple-400/10' },
  'risk-scores': { label: 'Risk Scores', color: 'text-red-400', bg: 'bg-red-400/10' },
  'nft-data': { label: 'NFT Data', color: 'text-pink-400', bg: 'bg-pink-400/10' },
  sentiment: { label: 'Sentiment', color: 'text-amber-400', bg: 'bg-amber-400/10' },
};

export function getTypeMeta(type: string) {
  return DATA_TYPE_META[type] ?? { label: type, color: 'text-gold', bg: 'bg-gold/10' };
}
