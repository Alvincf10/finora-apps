import express, { Request, Response } from 'express';
import { query } from '../db';
import { OpenClawService } from '../services/openClawService';

export const webhookRouter = express.Router();

webhookRouter.post('/webhook', async (req: Request, res: Response): Promise<any> => {
  const { from, text } = req.body;
  
  if (!from || !text) {
    return res.status(400).send('Bad Request');
  }

  const command = text.trim().toLowerCase();

  try {
    // Basic user registration on first message if they don't exist
    let userRes = await query('SELECT id FROM users WHERE phone_number = $1', [from]);
    let userId: number;
    
    if (userRes.rows.length === 0) {
      const newUsr = await query(
        'INSERT INTO users (name, phone_number) VALUES ($1, $2) RETURNING id',
        ['User', from]
      );
      userId = newUsr.rows[0].id;
    } else {
      userId = userRes.rows[0].id;
    }

    // Process commands from PRD #10
    if (command.startsWith('add task')) {
      const taskText = text.substring(8).trim();
      await query('INSERT INTO tasks (user_id, title) VALUES ($1, $2)', [userId, taskText]);
      await OpenClawService.sendMessage(from, `✅ Task ditambahkan: "${taskText}"`);
    } 
    else if (command === 'today') {
      const planRes = await query('SELECT plan_json FROM daily_plans WHERE user_id = $1 AND date = CURRENT_DATE', [userId]);
      if (planRes.rows.length > 0) {
        const msg = OpenClawService.formatDailyPlanMessage(planRes.rows[0].plan_json);
        await OpenClawService.sendMessage(from, msg);
      } else {
        await OpenClawService.sendMessage(from, 'Belum ada plan untuk hari ini. Saya akan buatkan sekarang...');
        // Optionally trigger generation here
      }
    }
    else if (command.startsWith('done')) {
      const doneText = text.substring(4).trim();
      // simplified match
      await query(
        "UPDATE tasks SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND title ILIKE $2", 
        [userId, `%${doneText}%`]
      );
      await OpenClawService.sendMessage(from, `✅ Task ${doneText} ditandai selesai!`);
    }
    else if (command === 'daily review') {
       const tasksRes = await query("SELECT * FROM tasks WHERE user_id = $1 AND DATE(updated_at) = CURRENT_DATE AND status = 'completed'", [userId]);
       const msg = `📊 *Daily Review*\n\nKamu telah menyelesaikan ${tasksRes.rows.length} task hari ini. Teruskan kerja bagusmu!`;
       await OpenClawService.sendMessage(from, msg);
    }
    else {
      await OpenClawService.sendMessage(from, "Perintah tidak dikenali. Coba: 'add task [nama]', 'today', 'done [nama]', 'daily review'");
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).send('Internal Server Error');
  }
});
