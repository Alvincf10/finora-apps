import { PlannerService } from '../services/plannerService';
import { OpenClawService } from '../services/openClawService';
import { query } from '../db';
import cron from 'node-cron';

export const startJobs = () => {
  // Morning Planner (07:00 every day)
  cron.schedule('0 7 * * *', async () => {
    console.log('Running Morning Planner job at 07:00');
    try {
      const plans = await PlannerService.processMorningPlans();
      
      // Send via OpenClaw
      for (const item of plans) {
        const userRes = await query('SELECT phone_number FROM users WHERE id = $1', [item.userId]);
        if (userRes.rows.length > 0) {
          const phoneNumber = userRes.rows[0].phone_number;
          const message = OpenClawService.formatDailyPlanMessage(item.plan);
          await OpenClawService.sendMessage(phoneNumber, message);
        }
      }
    } catch (error) {
      console.error('Error in Morning Planner job:', error);
    }
  }, {
    timezone: "Asia/Jakarta"
  });

  // Midday Check (13:00 every day)
  cron.schedule('0 13 * * *', async () => {
    console.log('Running Midday Check job at 13:00');
    try {
      // Fetch users
      const usersRes = await query('SELECT id, phone_number FROM users');
      for (const user of usersRes.rows) {
        // Simple logic for MVP Midday check
        const message = "☀️ *Midday Check-in*\nHow is your progress so far? Reply with 'done <task>' to mark tasks as completed.";
        await OpenClawService.sendMessage(user.phone_number, message);
      }
    } catch (error) {
      console.error('Error in Midday Check job:', error);
    }
  }, {
    timezone: "Asia/Jakarta"
  });

  // Evening Review (21:00 every day)
  cron.schedule('0 21 * * *', async () => {
    console.log('Running Evening Review job at 21:00');
    try {
      const usersRes = await query('SELECT id, phone_number FROM users');
      for (const user of usersRes.rows) {
        const tasksRes = await query("SELECT * FROM tasks WHERE user_id = $1 AND DATE(updated_at) = CURRENT_DATE AND status = 'completed'", [user.id]);
        const completedCount = tasksRes.rows.length;
        
        const message = `🌙 *Evening Review*\n\nToday you completed ${completedCount} tasks.\nGreat job! Tomorrow is a new day to achieve your goals.`;
        await OpenClawService.sendMessage(user.phone_number, message);
      }
    } catch (error) {
      console.error('Error in Evening Review job:', error);
    }
  }, {
    timezone: "Asia/Jakarta"
  });

  console.log('Scheduler started.');
};
