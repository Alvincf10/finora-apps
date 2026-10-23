import { query } from '../db';

interface Task {
  id: number;
  user_id: number;
  title: string;
  description: string;
  priority: number;
  deadline: string | null;
  status: string;
}

interface User {
  id: number;
  name: string;
  phone_number: string;
  working_hours: {
    start: string;
    end: string;
  };
}

export class PlannerService {
  
  /**
   * AI determines priority score based on PRD formula:
   * Priority Score = Deadline Weight + Importance Weight + Impact Weight + Goal Alignment
   * Note: This is a simplified programmatic version. In a full implementation, you could pass this to an LLM.
   */
  static calculatePriorityScore(task: Task): number {
    let score = 50; // base score
    
    // Deadline weight
    if (task.deadline) {
      const deadlineDate = new Date(task.deadline);
      const today = new Date();
      const diffTime = deadlineDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 0) score += 30;
      else if (diffDays <= 1) score += 20;
      else if (diffDays <= 3) score += 10;
    }
    
    // Base priority (importance/impact mapped to priority column)
    score += (task.priority - 50) * 0.5;
    
    return Math.min(100, Math.max(0, score)); // clamp 0-100
  }

  /**
   * Smart Time Blocking
   */
  static generateTimeBlocks(tasks: Task[], user: User) {
    // Sort tasks by calculated priority score
    const sortedTasks = tasks.map(t => ({
      ...t,
      score: this.calculatePriorityScore(t)
    })).sort((a, b) => b.score - a.score);

    const schedule: any[] = [];
    const workingStartHour = parseInt(user.working_hours?.start?.split(':')[0] || '9');
    let currentHour = workingStartHour;

    schedule.push({ time: `${currentHour.toString().padStart(2, '0')}:00`, task: 'Preparation & Planning', priority: 100 });
    currentHour++;

    for (const task of sortedTasks) {
      if (currentHour >= parseInt(user.working_hours?.end?.split(':')[0] || '17')) break;

      schedule.push({
        time: `${currentHour.toString().padStart(2, '0')}:00`,
        task: task.title,
        priority: task.score
      });
      
      currentHour += 2; // Assuming 2 hour blocks for deep work
    }
    
    // Add default routines if there's space
    if (currentHour < 17) schedule.push({ time: `17:00`, task: 'Wrap up & Documentation', priority: 50 });
    if (currentHour < 18) schedule.push({ time: `18:00`, task: 'Exercise / Personal Time', priority: 50 });

    return schedule;
  }

  /**
   * Generate Morning Plan for a user
   */
  static async generateMorningPlan(userId: number) {
    try {
      // Get User
      const userRes = await query('SELECT * FROM users WHERE id = $1', [userId]);
      if (userRes.rows.length === 0) return null;
      const user = userRes.rows[0];

      // Get pending tasks
      const tasksRes = await query("SELECT * FROM tasks WHERE user_id = $1 AND status = 'pending'", [userId]);
      const tasks = tasksRes.rows;

      const schedule = this.generateTimeBlocks(tasks, user);
      
      const planJson = {
        date: new Date().toISOString().split('T')[0],
        schedule,
        focus: tasks.length > 0 ? tasks[0].title : 'General'
      };

      // Save to database
      await query(
        `INSERT INTO daily_plans (user_id, date, plan_json) 
         VALUES ($1, CURRENT_DATE, $2)
         ON CONFLICT (user_id, date) DO UPDATE SET plan_json = $2`,
        [userId, JSON.stringify(planJson)]
      );

      return planJson;
    } catch (error) {
      console.error(`Error generating plan for user ${userId}:`, error);
      throw error;
    }
  }

  static async processMorningPlans() {
    const usersRes = await query('SELECT id FROM users');
    const plans = [];
    for (const user of usersRes.rows) {
      const plan = await this.generateMorningPlan(user.id);
      if(plan) plans.push({ userId: user.id, plan });
    }
    return plans;
  }
}
