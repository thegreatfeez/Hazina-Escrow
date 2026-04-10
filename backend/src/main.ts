import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { datasetsRouter } from './datasets/datasets.router';
import { paymentsRouter } from './payments/payments.router';
import { agentRouter } from './agent/agent.router';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Hazina Escrow API', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/datasets', datasetsRouter);
app.use('/api', paymentsRouter);
app.use('/api/agent', agentRouter);

app.listen(PORT, () => {
  console.log(`\n  ██╗  ██╗ █████╗ ███████╗██╗███╗   ██╗ █████╗`);
  console.log(`  ██║  ██║██╔══██╗╚══███╔╝██║████╗  ██║██╔══██╗`);
  console.log(`  ███████║███████║  ███╔╝ ██║██╔██╗ ██║███████║`);
  console.log(`  ██╔══██║██╔══██║ ███╔╝  ██║██║╚██╗██║██╔══██║`);
  console.log(`  ██║  ██║██║  ██║███████╗██║██║ ╚████║██║  ██║`);
  console.log(`  ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝`);
  console.log(`\n  Data Escrow API running on http://localhost:${PORT}\n`);
});

export default app;
