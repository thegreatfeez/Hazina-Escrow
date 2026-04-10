import { useState } from 'react';
import { ShoppingCart, TrendingUp, User, Zap } from 'lucide-react';
import clsx from 'clsx';
import { DatasetMeta } from '../../lib/api';
import { truncateAddress, formatUSDC, getTypeMeta } from '../../lib/utils';

interface Props {
  dataset: DatasetMeta;
  onBuy: (dataset: DatasetMeta) => void;
}

export default function DatasetCard({ dataset, onBuy }: Props) {
  const [hovered, setHovered] = useState(false);
  const typeMeta = getTypeMeta(dataset.type);

  return (
    <div
      className={clsx(
        'glass-card group relative cursor-pointer transition-all duration-300 overflow-hidden',
        hovered && 'shadow-card-hover border-border-gold/30 translate-y-[-2px]'
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Top gold shimmer line */}
      <div
        className={clsx(
          'absolute top-0 left-0 right-0 h-px transition-all duration-500',
          hovered ? 'bg-gradient-to-r from-transparent via-gold to-transparent opacity-100' : 'opacity-0'
        )}
      />

      <div className="p-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <span className={clsx('type-badge', typeMeta.color, typeMeta.bg)}>
            <Zap className="w-3 h-3" />
            {typeMeta.label}
          </span>
          <div className="text-right">
            <p className="text-xs text-muted-2 font-body">per query</p>
            <p className="text-lg font-display font-bold text-gold-gradient">
              ${formatUSDC(dataset.pricePerQuery)}
            </p>
          </div>
        </div>

        {/* Name */}
        <h3 className="font-display font-semibold text-foreground text-base mb-2 leading-snug line-clamp-2 group-hover:text-gold transition-colors duration-300">
          {dataset.name}
        </h3>

        {/* Description */}
        <p className="text-sm text-foreground-muted font-body leading-relaxed line-clamp-2 mb-5">
          {dataset.description}
        </p>

        {/* Stats */}
        <div className="flex items-center gap-4 mb-5">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-body text-foreground-muted">
              <span className="text-foreground font-medium">{dataset.queriesServed.toLocaleString()}</span> queries
            </span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-muted" />
            <span className="text-xs font-body text-foreground-muted font-mono">
              {truncateAddress(dataset.sellerWallet)}
            </span>
          </div>
        </div>

        {/* Earnings bar */}
        <div className="mb-5">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-muted-2 font-body">Total earned</span>
            <span className="text-xs font-body font-medium text-gold">${formatUSDC(dataset.totalEarned)} USDC</span>
          </div>
          <div className="h-1.5 bg-border/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${Math.min((dataset.totalEarned / 20) * 100, 100)}%`,
                background: 'linear-gradient(90deg, #C9A84C, #E8C96A)',
              }}
            />
          </div>
        </div>

        {/* Buy button */}
        <button
          onClick={() => onBuy(dataset)}
          className={clsx(
            'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-body font-semibold text-sm transition-all duration-300',
            hovered
              ? 'btn-gold'
              : 'border border-border-gold/30 text-gold hover:border-border-gold/50 hover:bg-gold/5'
          )}
        >
          <ShoppingCart className="w-4 h-4" />
          Buy Query — ${formatUSDC(dataset.pricePerQuery)} USDC
        </button>
      </div>
    </div>
  );
}
