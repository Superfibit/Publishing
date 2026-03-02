import cron from 'node-cron';
import { getDb, logActivity } from '../database';
import { generateId } from '../utils/helpers';
import logger from '../utils/logger';

interface ScheduledTask {
  id: string;
  type: string;
  payload: Record<string, any>;
  cronExpression: string;
  nextRun: string;
  lastRun: string | null;
  status: 'active' | 'paused' | 'completed';
}

type TaskHandler = (payload: Record<string, any>) => Promise<void>;

export class TaskScheduler {
  private handlers: Map<string, TaskHandler> = new Map();
  private activeJobs: Map<string, cron.ScheduledTask> = new Map();

  // Register a handler for a task type
  registerHandler(type: string, handler: TaskHandler): void {
    this.handlers.set(type, handler);
    logger.debug(`Task handler registered: ${type}`);
  }

  // Schedule a new task
  schedule(
    type: string,
    cronExpression: string,
    payload: Record<string, any> = {}
  ): ScheduledTask {
    const db = getDb();
    const id = generateId();

    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    const nextRun = this.getNextRunTime(cronExpression);

    db.prepare(`
      INSERT INTO scheduled_tasks (id, type, payload, cron_expression, next_run, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run(id, type, JSON.stringify(payload), cronExpression, nextRun);

    const task: ScheduledTask = {
      id,
      type,
      payload,
      cronExpression,
      nextRun,
      lastRun: null,
      status: 'active',
    };

    this.startJob(task);
    logActivity('task_scheduled', 'scheduled_task', id, { type, cronExpression });
    logger.info(`Task scheduled: ${type}`, { id, cronExpression });

    return task;
  }

  // Start a cron job for a task
  private startJob(task: ScheduledTask): void {
    const handler = this.handlers.get(task.type);
    if (!handler) {
      logger.warn(`No handler for task type: ${task.type}`);
      return;
    }

    const job = cron.schedule(task.cronExpression, async () => {
      try {
        logger.info(`Running scheduled task: ${task.type}`, { id: task.id });
        await handler(task.payload);

        const db = getDb();
        const now = new Date().toISOString();
        const nextRun = this.getNextRunTime(task.cronExpression);

        db.prepare(`
          UPDATE scheduled_tasks SET last_run = ?, next_run = ? WHERE id = ?
        `).run(now, nextRun, task.id);

        logActivity('task_executed', 'scheduled_task', task.id, { type: task.type });
      } catch (error: any) {
        logger.error(`Scheduled task failed: ${task.type}`, {
          id: task.id,
          error: error.message,
        });
      }
    });

    this.activeJobs.set(task.id, job);
  }

  // Pause a task
  pause(id: string): void {
    const job = this.activeJobs.get(id);
    if (job) {
      job.stop();
      const db = getDb();
      db.prepare(`UPDATE scheduled_tasks SET status = 'paused' WHERE id = ?`).run(id);
      logger.info(`Task paused: ${id}`);
    }
  }

  // Resume a task
  resume(id: string): void {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM scheduled_tasks WHERE id = ?`).get(id) as any;
    if (row) {
      db.prepare(`UPDATE scheduled_tasks SET status = 'active' WHERE id = ?`).run(id);
      this.startJob({
        id: row.id,
        type: row.type,
        payload: JSON.parse(row.payload),
        cronExpression: row.cron_expression,
        nextRun: row.next_run,
        lastRun: row.last_run,
        status: 'active',
      });
      logger.info(`Task resumed: ${id}`);
    }
  }

  // Delete a task
  delete(id: string): void {
    const job = this.activeJobs.get(id);
    if (job) {
      job.stop();
      this.activeJobs.delete(id);
    }
    const db = getDb();
    db.prepare(`DELETE FROM scheduled_tasks WHERE id = ?`).run(id);
    logger.info(`Task deleted: ${id}`);
  }

  // Load and start all active tasks from database
  loadActiveTasks(): void {
    const db = getDb();
    const rows = db.prepare(`SELECT * FROM scheduled_tasks WHERE status = 'active'`).all() as any[];

    for (const row of rows) {
      this.startJob({
        id: row.id,
        type: row.type,
        payload: JSON.parse(row.payload),
        cronExpression: row.cron_expression,
        nextRun: row.next_run,
        lastRun: row.last_run,
        status: row.status,
      });
    }

    logger.info(`Loaded ${rows.length} active scheduled tasks`);
  }

  // Get all tasks
  getTasks(status?: string): ScheduledTask[] {
    const db = getDb();
    let query = 'SELECT * FROM scheduled_tasks';
    const params: any[] = [];
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    query += ' ORDER BY next_run ASC';
    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload),
      cronExpression: row.cron_expression,
      nextRun: row.next_run,
      lastRun: row.last_run,
      status: row.status,
    }));
  }

  // Stop all jobs
  stopAll(): void {
    for (const [id, job] of this.activeJobs) {
      job.stop();
    }
    this.activeJobs.clear();
    logger.info('All scheduled tasks stopped');
  }

  private getNextRunTime(cronExpression: string): string {
    // Simple approximation - returns current time + estimated interval
    return new Date(Date.now() + 60000).toISOString();
  }
}

export const taskScheduler = new TaskScheduler();
