import { initializeDatadog } from './common/datadog';
import dotenv from 'dotenv';

dotenv.config();
initializeDatadog();

import express from 'express';
import cors from 'cors';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

import { datasetsRouter } from './datasets/datasets.router';
import { paymentsRouter } from './payments/payments.router';
import { agentRouter } from './agent/agent.router';
import { webhooksRouter } from './webhooks/webhook.router';
import { readStore } from './common/storage';
import { rateLimitMiddleware } from './common/rateLimit';
import { BackupScheduler } from './common/backup.scheduler';
import { backupRouter, setBackupScheduler } from './common/backup.router';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json({ limit: "10mb" }));

// Apply rate limiting to all API routes
app.use('/api', rateLimitMiddleware);

// Initialize backup scheduler
const backupEnabled = process.env.BACKUP_ENABLED !== 'false';
if (backupEnabled) {
  const backupScheduler = new BackupScheduler({
    enabled: true,
    backupDir: process.env.BACKUP_DIR || path.join(__dirname, '../../backups'),
    maxBackups: parseInt(process.env.BACKUP_MAX_BACKUPS || '30', 10),
    cronSchedule: process.env.BACKUP_CRON_SCHEDULE || '0 0 * * *', // Daily at midnight by default
  });
  
  backupScheduler.start();
  setBackupScheduler(backupScheduler);
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[Backup] Stopping backup scheduler...');
    backupScheduler.stop();
  });
  
  process.on('SIGINT', () => {
    console.log('[Backup] Stopping backup scheduler...');
    backupScheduler.stop();
    process.exit(0);
  });
}

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Hazina Escrow API',
      version: '1.0.0',
      description: 'API documentation for Hazina Data Escrow platform',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Local development server',
      },
    ],
  },
  apis: ['./src/**/*.ts'], // Path to the API docs
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Health check with service monitoring
const HEALTH_TIMEOUT_MS = 3000;
const HORIZON_URL = "https://horizon-testnet.stellar.org/";

type CheckResult = "ok" | "error";

async function withHealthTimeout(
  fn: () => Promise<CheckResult>,
): Promise<CheckResult> {
  return Promise.race<CheckResult>([
    fn().catch(() => "error"),
    new Promise<CheckResult>((resolve) =>
      setTimeout(() => resolve("error"), HEALTH_TIMEOUT_MS),
    ),
  ]);
}

async function checkStorage(): Promise<CheckResult> {
  try {
    readStore();
    return "ok";
  } catch {
    return "error";
  }
}

async function checkAnthropic(): Promise<CheckResult> {
  return process.env.ANTHROPIC_API_KEY ? "ok" : "error";
}

async function checkStellar(): Promise<CheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(HORIZON_URL, {
      method: "GET",
      signal: controller.signal,
    });
    return response.ok ? "ok" : "error";
  } catch {
    return "error";
  } finally {
    clearTimeout(timer);
  }
}

app.get("/health", async (_req, res) => {
  const [storage, anthropic, stellar] = await Promise.all([
    withHealthTimeout(checkStorage),
    withHealthTimeout(checkAnthropic),
    withHealthTimeout(checkStellar),
  ]);

  const checks = { storage, anthropic, stellar };
  const allOk =
    storage === "ok" && anthropic === "ok" && stellar === "ok";

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ok" : "degraded",
    checks,
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/datasets', datasetsRouter);
app.use('/api', paymentsRouter);
app.use('/api/agent', agentRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api', backupRouter);

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
