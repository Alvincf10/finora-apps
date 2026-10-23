import express from 'express';
import dotenv from 'dotenv';
import { startJobs } from './jobs/scheduler';
import { webhookRouter } from './controllers/webhookController';

dotenv.config();

const app = express();
app.use(express.json());

// Load Webhook routes
app.use('/api', webhookRouter);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Daily Planner AI Agent is running on port ${PORT}`);
  
  // Start the background jobs
  startJobs();
});
