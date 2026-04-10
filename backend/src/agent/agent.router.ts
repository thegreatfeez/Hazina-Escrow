import { Router, Request, Response } from 'express';
import { runResearchAgent, runResearchAgentDemo } from './agent.service';
import { getAgentPublicKey } from './agent.wallet';

export const agentRouter = Router();

// GET /api/agent/info — agent wallet address and capabilities
agentRouter.get('/info', (_req: Request, res: Response) => {
  res.json({
    success: true,
    agent: {
      name: 'Hazina Research Agent',
      version: '1.0.0',
      description: 'Autonomous DeFi yield researcher. Pays data sellers via x402 on Stellar, synthesises with Claude AI.',
      agentWallet: getAgentPublicKey() ?? 'Not configured (demo-only mode)',
      fee: {
        amount: 1,
        currency: 'USDC',
        network: 'Stellar',
        description: 'Flat fee per research job',
      },
      sellers: [
        { type: 'yield-data',    role: 'APY & protocol data',      cost: 0.02 },
        { type: 'whale-wallets', role: 'Whale wallet movements',    cost: 0.05 },
        { type: 'risk-scores',   role: 'Protocol risk scores',      cost: 0.03 },
        { type: 'sentiment',     role: 'Social market sentiment',   cost: 0.04 },
      ],
      agentProfit: 0.86,
      escrowWallet: process.env.ESCROW_WALLET ?? 'Not configured',
    },
  });
});

// POST /api/agent/research — real mode (requires Stellar payment + funded agent wallet)
// Body: { query: string, txHash: string }
agentRouter.post('/research', async (req: Request, res: Response) => {
  const { query, txHash } = req.body;

  if (!query || typeof query !== 'string' || query.trim().length < 5) {
    return res.status(400).json({ error: 'query is required (min 5 chars)' });
  }
  if (!txHash || typeof txHash !== 'string') {
    return res.status(400).json({ error: 'txHash of your 1 USDC payment is required' });
  }

  // Respond with 402 first if no ESCROW_WALLET configured
  if (!process.env.ESCROW_WALLET) {
    return res.status(402).json({
      error: 'Payment Required',
      x402: true,
      message: 'ESCROW_WALLET not configured. Use /api/agent/research/demo for testing.',
    });
  }

  try {
    console.log(`[Agent] New research job: "${query}"`);
    const job = await runResearchAgent(query.trim(), txHash.trim());

    return res.json({
      success: true,
      jobId: job.jobId,
      query: job.query,
      report: job.report,
      payments: {
        humanPaid: 1,
        currency: 'USDC',
        network: 'Stellar',
        humanTxHash: job.humanTxHash,
        sellerPayments: job.purchases.map((p) => ({
          seller: p.datasetName,
          type: p.type,
          amount: p.amountPaid,
          txHash: p.txHash,
          onChain: !p.demo,
        })),
        totalSpent: job.totalSpent,
        agentProfit: job.agentProfit,
      },
      meta: {
        agentWallet: job.agentWallet,
        timestamp: job.timestamp,
        datasetsQueried: job.purchases.length,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Research agent error';
    console.error('[Agent] Error:', err);

    if (message.includes('Payment verification failed') || message.includes('verification failed')) {
      return res.status(402).json({ error: message });
    }
    if (message.includes('already used')) {
      return res.status(400).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
});

// POST /api/agent/research/demo — demo mode, no real payments needed
// Body: { query: string }
agentRouter.post('/research/demo', async (req: Request, res: Response) => {
  const { query } = req.body;

  if (!query || typeof query !== 'string' || query.trim().length < 5) {
    return res.status(400).json({ error: 'query is required (min 5 chars)' });
  }

  try {
    console.log(`[Agent][Demo] New research job: "${query}"`);
    const job = await runResearchAgentDemo(query.trim());

    return res.json({
      success: true,
      demo: true,
      jobId: job.jobId,
      query: job.query,
      report: job.report,
      payments: {
        humanPaid: 1,
        currency: 'USDC',
        network: 'Stellar (simulated)',
        note: 'Demo mode — no real Stellar transactions. All payments simulated.',
        sellerPayments: job.purchases.map((p) => ({
          seller: p.datasetName,
          type: p.type,
          amount: p.amountPaid,
          txHash: p.txHash,
          onChain: false,
        })),
        totalSpent: job.totalSpent,
        agentProfit: job.agentProfit,
      },
      meta: {
        agentWallet: job.agentWallet ?? 'demo-wallet',
        timestamp: job.timestamp,
        datasetsQueried: job.purchases.length,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Research agent error';
    console.error('[Agent][Demo] Error:', err);
    return res.status(500).json({ error: message });
  }
});
