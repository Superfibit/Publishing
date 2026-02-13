import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { initializeDatabase } from './database';
import { taskScheduler } from './core/scheduler';
import { DEFAULT_BOOKS } from './config/books';
import { getDb } from './database';
import { generateId } from './utils/helpers';
import logger from './utils/logger';

// Import routes
import bookRoutes from './routes/books';
import campaignRoutes from './routes/campaigns';
import contentRoutes from './routes/content';
import approvalRoutes from './routes/approvals';
import analyticsRoutes from './routes/analytics';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files (dashboard)
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/books', bookRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Serve dashboard for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Initialize and start
async function start(): Promise<void> {
  try {
    // Initialize database
    initializeDatabase();
    logger.info('Database initialized');

    // Seed default books if empty
    const db = getDb();
    const bookCount = (db.prepare('SELECT COUNT(*) as count FROM books').get() as any).count;

    if (bookCount === 0) {
      for (const book of DEFAULT_BOOKS) {
        db.prepare(`
          INSERT INTO books (id, asin, genre, amazon_url)
          VALUES (?, ?, ?, ?)
        `).run(generateId(), book.asin, book.genre || 'Fiction', book.amazonUrl || '');
      }
      logger.info(`Seeded ${DEFAULT_BOOKS.length} default books`);
    }

    // Load scheduled tasks
    taskScheduler.loadActiveTasks();

    // Start server
    app.listen(config.port, () => {
      logger.info(`AI Book Publisher running on http://localhost:${config.port}`);
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║                   AI BOOK PUBLISHER                         ║
║                                                              ║
║  Dashboard:  http://localhost:${config.port}                       ║
║  API:        http://localhost:${config.port}/api                   ║
║  Health:     http://localhost:${config.port}/api/health             ║
║                                                              ║
║  Books tracked: ${DEFAULT_BOOKS.length}                                        ║
║  ASINs: ${DEFAULT_BOOKS.map((b) => b.asin).join(', ')}  ║
║                                                              ║
║  ⚠  All financial actions require your approval!             ║
╚══════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error: any) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  taskScheduler.stopAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  taskScheduler.stopAll();
  process.exit(0);
});

start();
