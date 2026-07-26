import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { routes } from './routes/index.js';
import { errorHandler } from './error-handler.js';
import { runMigration } from './db.js';

dotenv.config({ path: '../../.env' });
dotenv.config({ path: '.env' });

const app = express();
const PORT = process.env.ASSEMBLY_SRV_PORT || 3107;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api', routes);

app.use(errorHandler);

async function main() {
  await runMigration();
  app.listen(PORT, () => {
    console.log(`assembly-srv listening on http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('assembly-srv startup failed:', err);
  process.exit(1);
});
