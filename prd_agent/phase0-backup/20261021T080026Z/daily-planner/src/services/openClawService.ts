import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const OPENCLAW_WEBHOOK_URL = process.env.OPENCLAW_WEBHOOK_URL;

export class OpenClawService {
  /**
   * Send message to a user via OpenClaw webhook
   */
  static async sendMessage(phoneNumber: string, message: string) {
    if (!OPENCLAW_WEBHOOK_URL) {
      console.warn('OPENCLAW_WEBHOOK_URL is not set. Skipping message send.');
      console.log(`[MOCK MESSAGE TO ${phoneNumber}]: \n${message}`);
      return;
    }
    
    // Always print mock regardless of whether webhook succeeds for debugging
    console.log(`[OUTGOING TO ${phoneNumber}]: \n${message}`);

    try {
      // Use OpenClaw gateway token
      const TOKEN = "c66a111d9dd1476ccae2e8b0418e9ed1282f892365ee88a7";
      await axios.post(`${OPENCLAW_WEBHOOK_URL}/v1/messages`, {
        to: `whatsapp:${phoneNumber}`,
        text: message
      }, {
        headers: {
          'Authorization': `Bearer ${TOKEN}`
        }
      });
      console.log(`Message sent to ${phoneNumber}`);
    } catch (error) {
      console.error(`Failed to send message to ${phoneNumber}:`, error);
    }
  }

  /**
   * Format Daily Plan into readable WhatsApp message
   */
  static formatDailyPlanMessage(plan: any): string {
    let msg = `🌅 *Good Morning! Here is your plan for today (${plan.date})*\n\n`;
    msg += `🎯 *Main Focus*: ${plan.focus}\n\n`;
    msg += `🗓️ *Schedule*:\n`;
    
    plan.schedule.forEach((item: any) => {
      msg += `${item.time} - ${item.task} (Pri: ${item.priority})\n`;
    });

    msg += `\n💪 *How is your energy today?*\n1. Low\n2. Normal\n3. High\n`;
    return msg;
  }
}
