import Database from 'better-sqlite3';
import { config } from '../config';
import logger from '../utils/logger';
import path from 'path';
import fs from 'fs';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(config.db.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(config.db.path);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    logger.info('Database connected', { path: config.db.path });
  }
  return db;
}

export function initializeDatabase(): void {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      asin TEXT UNIQUE NOT NULL,
      title TEXT DEFAULT '',
      author TEXT DEFAULT '',
      genre TEXT DEFAULT 'Fiction',
      sub_genre TEXT DEFAULT '',
      description TEXT DEFAULT '',
      keywords TEXT DEFAULT '[]',
      amazon_url TEXT DEFAULT '',
      cover_image_url TEXT DEFAULT '',
      price TEXT DEFAULT '',
      publication_date TEXT DEFAULT '',
      series TEXT DEFAULT '',
      series_position INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      channel TEXT NOT NULL,
      config TEXT DEFAULT '{}',
      budget REAL DEFAULT 0,
      spent REAL DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id)
    );

    CREATE TABLE IF NOT EXISTS content (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      campaign_id TEXT,
      type TEXT NOT NULL,
      title TEXT DEFAULT '',
      body TEXT DEFAULT '',
      platform TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      scheduled_for TEXT,
      published_at TEXT,
      metadata TEXT DEFAULT '{}',
      performance TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT DEFAULT '',
      amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'pending',
      metadata TEXT DEFAULT '{}',
      requested_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      resolved_by TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS analytics (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      date TEXT NOT NULL,
      source TEXT NOT NULL,
      metric TEXT NOT NULL,
      value REAL DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id)
    );

    CREATE TABLE IF NOT EXISTS email_subscribers (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT '',
      source TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active',
      subscribed_at TEXT DEFAULT (datetime('now')),
      unsubscribed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS email_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_html TEXT DEFAULT '',
      body_text TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      sent_count INTEGER DEFAULT 0,
      open_count INTEGER DEFAULT 0,
      click_count INTEGER DEFAULT 0,
      scheduled_for TEXT,
      sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      cron_expression TEXT DEFAULT '',
      next_run TEXT,
      last_run TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity_type TEXT DEFAULT '',
      entity_id TEXT DEFAULT '',
      details TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_content_book_id ON content(book_id);
    CREATE INDEX IF NOT EXISTS idx_content_status ON content(status);
    CREATE INDEX IF NOT EXISTS idx_campaigns_book_id ON campaigns(book_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_book_date ON analytics(book_id, date);
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
    CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
  `);

  logger.info('Database initialized with all tables');
}

export function logActivity(action: string, entityType: string, entityId: string, details: object): void {
  const database = getDb();
  const { generateId } = require('../utils/helpers');
  database.prepare(`
    INSERT INTO activity_log (id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(generateId(), action, entityType, entityId, JSON.stringify(details));
}
