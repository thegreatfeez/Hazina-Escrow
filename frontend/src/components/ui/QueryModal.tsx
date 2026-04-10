import { useState, useEffect } from 'react';
import {
  X, Copy, Check, ExternalLink, Loader2, Sparkles,
  ShieldCheck, AlertCircle, ChevronRight, Zap
} from 'lucide-react';
import { api, DatasetMeta, QueryResult } from '../../lib/api';
import { formatUSDC, getTypeMeta, truncateAddress } from '../../lib/utils';
import clsx from 'clsx';

type Step = 'details' | 'payment' | 'verifying' | 'result' | 'error';

interface Props {
  dataset: DatasetMeta;
  onClose: () => void;
  onSuccess: (updated: Partial<DatasetMeta> & { id: string }) => void;
}

export default function QueryModal({ dataset, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('details');
  const [paymentInfo, setPaymentInfo] = useState<{
    paymentAddress: string; amount: number; memo: string;
  } | null>(null);
  const [txHash, setTxHash] = useState('');
  const [buyerQuestion, setBuyerQuestion] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [useDemoMode, setUseDemoMode] = useState(false);

  const typeMeta = getTypeMeta(dataset.type);

  // Fetch 402 payment details
  useEffect(() => {
    if (step === 'payment' && !paymentInfo) {
      api.initiateQuery(dataset.id).then((res) => {
        if (res.payment) setPaymentInfo(res.payment);
      });
    }
  }, [step, paymentInfo, dataset.id]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleVerify = async () => {
    if (!txHash.trim() && !useDemoMode) return;
    setStep('verifying');
    try {
      let res: QueryResult;
      if (useDemoMode) {
        res = await api.demoQuery(dataset.id, buyerQuestion);
      } else {
        res = await api.verifyPayment(dataset.id, txHash.trim(), buyerQuestion);
      }
      setResult(res);
      setStep('result');
      onSuccess({
        id: dataset.id,
        queriesServed: dataset.queriesServed + 1,
        totalEarned: dataset.totalEarned + dataset.pricePerQuery * 0.95,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setStep('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-void/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg glass-card-gold overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Gold top bar */}
        <div className="h-px bg-gradient-to-r from-transparent via-gold to-transparent" />

        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <span className={clsx('type-badge text-xs mb-2 inline-flex', typeMeta.color, typeMeta.bg)}>
              <Zap className="w-3 h-3" />
              {typeMeta.label}
            </span>
            <h2 className="font-display font-bold text-xl text-foreground leading-tight">
              {dataset.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground p-1 transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress steps */}
        {step !== 'result' && step !== 'error' && (
          <div className="flex items-center gap-0 px-6 mb-6">
            {(['details', 'payment', 'verifying'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center flex-1">
                <div className={clsx(
                  'w-7 h-7 rounded-full border text-xs font-body font-medium flex items-center justify-center flex-shrink-0',
                  step === s ? 'border-gold bg-gold text-void' :
                  ['payment', 'verifying'].includes(step) && i === 0 ? 'border-gold/50 bg-gold/10 text-gold' :
                  step === 'verifying' && i === 1 ? 'border-gold/50 bg-gold/10 text-gold' :
                  'border-border text-muted'
                )}>
                  {i + 1}
                </div>
                {i < 2 && <div className={clsx('flex-1 h-px', i < ['details', 'payment', 'verifying'].indexOf(step) ? 'bg-gold/40' : 'bg-border')} />}
              </div>
            ))}
          </div>
        )}

        <div className="px-6 pb-6">

          {/* ── STEP 1: Details ── */}
          {step === 'details' && (
            <div>
              <p className="text-sm text-foreground-muted font-body mb-5 leading-relaxed">
                {dataset.description}
              </p>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="glass-card p-4">
                  <p className="text-xs text-muted-2 font-body mb-1">Price per Query</p>
                  <p className="font-display font-bold text-xl text-gold">${formatUSDC(dataset.pricePerQuery)} USDC</p>
                </div>
                <div className="glass-card p-4">
                  <p className="text-xs text-muted-2 font-body mb-1">Queries Sold</p>
                  <p className="font-display font-bold text-xl text-foreground">{dataset.queriesServed.toLocaleString()}</p>
                </div>
                <div className="glass-card p-4">
                  <p className="text-xs text-muted-2 font-body mb-1">Seller</p>
                  <p className="font-mono text-xs text-foreground">{truncateAddress(dataset.sellerWallet)}</p>
                </div>
                <div className="glass-card p-4">
                  <p className="text-xs text-muted-2 font-body mb-1">Network</p>
                  <p className="text-xs font-body font-medium text-emerald-400">Stellar Testnet</p>
                </div>
              </div>

              {/* Optional question */}
              <div className="mb-5">
                <label className="text-sm font-body font-medium text-foreground-muted mb-2 block">
                  Ask Claude a question about this data <span className="text-muted-2">(optional)</span>
                </label>
                <textarea
                  value={buyerQuestion}
                  onChange={(e) => setBuyerQuestion(e.target.value)}
                  placeholder="e.g. Which wallet moved the most ETH? What's the highest risk wallet?"
                  className="w-full bg-void/60 border border-border/60 rounded-xl p-3 text-sm font-body text-foreground placeholder:text-muted focus:outline-none focus:border-gold/40 transition-colors resize-none h-20"
                />
              </div>

              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 mb-5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <p className="text-xs text-emerald-400 font-body">
                  AI escrow verifies your payment on Stellar before releasing data
                </p>
              </div>

              <button onClick={() => setStep('payment')} className="btn-gold w-full flex items-center justify-center gap-2 py-3.5">
                Proceed to Payment
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ── STEP 2: Payment ── */}
          {step === 'payment' && (
            <div>
              <div className="text-center mb-5 p-5 glass-card">
                <p className="text-4xl font-display font-bold text-gold mb-1">
                  ${formatUSDC(dataset.pricePerQuery)}
                </p>
                <p className="text-sm text-foreground-muted font-body">USDC on Stellar Testnet</p>
              </div>

              {paymentInfo ? (
                <div className="space-y-3 mb-5">
                  <div className="glass-card p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-muted-2 font-body">Send to Address</p>
                      <button
                        onClick={() => copyToClipboard(paymentInfo.paymentAddress, 'addr')}
                        className="text-gold hover:text-gold-light transition-colors"
                      >
                        {copied === 'addr' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="font-mono text-xs text-foreground break-all">{paymentInfo.paymentAddress}</p>
                  </div>

                  <div className="glass-card p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-muted-2 font-body">Required Memo</p>
                      <button
                        onClick={() => copyToClipboard(paymentInfo.memo, 'memo')}
                        className="text-gold hover:text-gold-light transition-colors"
                      >
                        {copied === 'memo' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="font-mono text-sm text-amber-400">{paymentInfo.memo}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-gold animate-spin" />
                </div>
              )}

              {/* Instructions */}
              <div className="p-4 rounded-xl bg-gold/5 border border-gold/15 mb-5">
                <p className="text-xs font-body font-semibold text-gold mb-2">Payment Steps:</p>
                <ol className="space-y-1">
                  {[
                    `Get testnet USDC from Stellar Friendbot`,
                    `Send exactly $${dataset.pricePerQuery} USDC to the address above`,
                    'Include the memo exactly as shown',
                    'Paste the transaction hash below',
                  ].map((step, i) => (
                    <li key={i} className="text-xs text-foreground-muted font-body flex gap-2">
                      <span className="text-gold flex-shrink-0">{i + 1}.</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Tx hash input */}
              <div className="mb-4">
                <label className="text-sm font-body font-medium text-foreground-muted mb-2 block">
                  Transaction Hash
                </label>
                <input
                  type="text"
                  placeholder="Paste your Stellar transaction hash..."
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  className="w-full bg-void/60 border border-border/60 rounded-xl px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted focus:outline-none focus:border-gold/40 transition-colors"
                />
              </div>

              {/* Demo mode toggle */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-2/60 border border-border/40 mb-4">
                <input
                  type="checkbox"
                  id="demo-mode"
                  checked={useDemoMode}
                  onChange={(e) => setUseDemoMode(e.target.checked)}
                  className="w-4 h-4 accent-amber-400"
                />
                <label htmlFor="demo-mode" className="text-xs text-foreground-muted font-body">
                  <span className="text-amber-400 font-medium">Demo mode</span> — skip payment, just get AI analysis (hackathon mode)
                </label>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep('details')} className="btn-ghost flex-1 py-3 text-sm">
                  Back
                </button>
                <button
                  onClick={handleVerify}
                  disabled={!txHash.trim() && !useDemoMode}
                  className={clsx(
                    'btn-gold flex-1 py-3 text-sm flex items-center justify-center gap-2',
                    !txHash.trim() && !useDemoMode && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <ShieldCheck className="w-4 h-4" />
                  {useDemoMode ? 'Get AI Analysis' : 'Verify & Get Data'}
                </button>
              </div>

              <a
                href="https://laboratory.stellar.org"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 mt-3 text-xs text-muted hover:text-gold transition-colors font-body"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Stellar Laboratory
              </a>
            </div>
          )}

          {/* ── STEP 3: Verifying ── */}
          {step === 'verifying' && (
            <div className="text-center py-10">
              <div className="relative inline-flex mb-6">
                <div className="w-16 h-16 rounded-full border-2 border-gold/20 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-gold animate-spin" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-gold/10 animate-ping" />
              </div>
              <h3 className="font-display font-semibold text-xl text-foreground mb-2">
                Verifying Payment
              </h3>
              <p className="text-sm text-foreground-muted font-body">
                Checking Stellar blockchain & generating AI analysis...
              </p>
            </div>
          )}

          {/* ── RESULT ── */}
          {step === 'result' && result && (
            <div>
              <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-body font-semibold text-emerald-400">Payment Verified</p>
                  <p className="text-xs text-emerald-400/70 font-body font-mono">{result.transaction.hash.slice(0, 40)}...</p>
                </div>
              </div>

              {/* Transaction breakdown */}
              <div className="grid grid-cols-3 gap-2 mb-5">
                <div className="glass-card p-3 text-center">
                  <p className="text-xs text-muted-2 font-body mb-1">Paid</p>
                  <p className="text-sm font-bold text-gold font-display">${result.transaction.amount} USDC</p>
                </div>
                <div className="glass-card p-3 text-center">
                  <p className="text-xs text-muted-2 font-body mb-1">Seller Gets</p>
                  <p className="text-sm font-bold text-emerald-400 font-display">${result.transaction.sellerReceived}</p>
                </div>
                <div className="glass-card p-3 text-center">
                  <p className="text-xs text-muted-2 font-body mb-1">Platform</p>
                  <p className="text-sm font-bold text-foreground-muted font-display">${result.transaction.platformFee}</p>
                </div>
              </div>

              {/* AI Summary */}
              <div className="mb-5 p-4 rounded-xl bg-gradient-to-br from-gold/5 to-transparent border border-gold/15">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-gold" />
                  <p className="text-sm font-body font-semibold text-gold">Claude AI Analysis</p>
                </div>
                <p className="text-sm text-foreground font-body leading-relaxed">
                  {result.ai.summary}
                </p>
                {result.ai.answer && (
                  <div className="mt-3 pt-3 border-t border-gold/10">
                    <p className="text-xs font-body font-semibold text-gold mb-1">Answer to your question:</p>
                    <p className="text-sm text-foreground font-body leading-relaxed">
                      {result.ai.answer}
                    </p>
                  </div>
                )}
              </div>

              {/* Raw data preview */}
              <div className="mb-5">
                <p className="text-xs font-body font-semibold text-foreground-muted mb-2">Raw Data Preview</p>
                <div className="bg-void rounded-xl p-4 max-h-48 overflow-auto border border-border/40">
                  <pre className="text-xs font-mono text-foreground-muted leading-relaxed whitespace-pre-wrap">
                    {JSON.stringify(result.data, null, 2).slice(0, 1200)}
                    {JSON.stringify(result.data, null, 2).length > 1200 ? '\n...' : ''}
                  </pre>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `hazina-${dataset.id}.json`;
                    a.click();
                  }}
                  className="btn-ghost flex-1 py-3 text-sm"
                >
                  Download JSON
                </button>
                <button onClick={onClose} className="btn-gold flex-1 py-3 text-sm">
                  Done
                </button>
              </div>
            </div>
          )}

          {/* ── ERROR ── */}
          {step === 'error' && (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-red-400" />
              </div>
              <h3 className="font-display font-semibold text-xl text-foreground mb-2">Verification Failed</h3>
              <p className="text-sm text-red-400 font-body mb-6 bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                {error}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setStep('payment')} className="btn-ghost flex-1 py-3 text-sm">
                  Try Again
                </button>
                <button onClick={onClose} className="btn-ghost flex-1 py-3 text-sm border-border text-foreground-muted">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
