import express from 'express';
import cors from 'cors';
import routes from './routes';

const PORT = parseInt(process.env.PORT || '3106');

const app = express();

app.use(cors());
app.use(express.json());

// Mount all cascade routes at /cascade
app.use('/cascade', routes);

// Root health check
app.get('/', (_req, res) => {
  res.json({ name: 'cascade-srv', version: '1.0.0', port: PORT });
});

app.listen(PORT, () => {
  console.log(`cascade-srv listening on http://localhost:${PORT}`);
  console.log(`  Events API: http://localhost:${PORT}/cascade/events`);
  console.log(`  Analytics:  http://localhost:${PORT}/cascade/analytics`);
  console.log(`  Lineage:    http://localhost:${PORT}/cascade/lineage`);
  console.log(`  Health:     http://localhost:${PORT}/cascade/health`);
});
