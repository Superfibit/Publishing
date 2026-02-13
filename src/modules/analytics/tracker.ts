import { getDb, logActivity } from '../../database';
import { generateId } from '../../utils/helpers';
import logger from '../../utils/logger';

export interface AnalyticsData {
  bookId: string;
  date: string;
  source: string;
  metric: string;
  value: number;
}

export interface DashboardStats {
  totalBooks: number;
  totalContent: number;
  totalCampaigns: number;
  pendingApprovals: number;
  totalSubscribers: number;
  contentByType: Record<string, number>;
  contentByStatus: Record<string, number>;
  recentActivity: any[];
  approvalSummary: { pending: number; approved: number; denied: number; totalSpend: number };
}

export class AnalyticsTracker {
  // Record an analytics data point
  record(bookId: string, source: string, metric: string, value: number): void {
    const db = getDb();
    const date = new Date().toISOString().split('T')[0];

    db.prepare(`
      INSERT INTO analytics (id, book_id, date, source, metric, value)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(generateId(), bookId, date, source, metric, value);
  }

  // Get analytics for a book over a date range
  getBookAnalytics(bookId: string, startDate: string, endDate: string): any[] {
    const db = getDb();
    return db.prepare(`
      SELECT date, source, metric, SUM(value) as value
      FROM analytics
      WHERE book_id = ? AND date >= ? AND date <= ?
      GROUP BY date, source, metric
      ORDER BY date DESC
    `).all(bookId, startDate, endDate);
  }

  // Get full dashboard statistics
  getDashboardStats(): DashboardStats {
    const db = getDb();

    const totalBooks = (db.prepare('SELECT COUNT(*) as count FROM books').get() as any).count;
    const totalContent = (db.prepare('SELECT COUNT(*) as count FROM content').get() as any).count;
    const totalCampaigns = (db.prepare('SELECT COUNT(*) as count FROM campaigns').get() as any).count;
    const pendingApprovals = (db.prepare("SELECT COUNT(*) as count FROM approvals WHERE status = 'pending'").get() as any).count;
    const totalSubscribers = (db.prepare("SELECT COUNT(*) as count FROM email_subscribers WHERE status = 'active'").get() as any).count;

    // Content by type
    const contentTypes = db.prepare(`
      SELECT type, COUNT(*) as count FROM content GROUP BY type
    `).all() as any[];
    const contentByType: Record<string, number> = {};
    contentTypes.forEach((row: any) => { contentByType[row.type] = row.count; });

    // Content by status
    const contentStatuses = db.prepare(`
      SELECT status, COUNT(*) as count FROM content GROUP BY status
    `).all() as any[];
    const contentByStatus: Record<string, number> = {};
    contentStatuses.forEach((row: any) => { contentByStatus[row.status] = row.count; });

    // Recent activity
    const recentActivity = db.prepare(`
      SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 20
    `).all();

    // Approval summary
    const approvalStats = db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'denied' THEN 1 ELSE 0 END) as denied,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as total_spend
      FROM approvals
    `).get() as any;

    return {
      totalBooks,
      totalContent,
      totalCampaigns,
      pendingApprovals,
      totalSubscribers,
      contentByType,
      contentByStatus,
      recentActivity,
      approvalSummary: {
        pending: approvalStats?.pending || 0,
        approved: approvalStats?.approved || 0,
        denied: approvalStats?.denied || 0,
        totalSpend: approvalStats?.total_spend || 0,
      },
    };
  }

  // Get performance summary for a specific book
  getBookPerformance(bookId: string): any {
    const db = getDb();

    const contentCount = (db.prepare('SELECT COUNT(*) as count FROM content WHERE book_id = ?').get(bookId) as any).count;
    const publishedCount = (db.prepare("SELECT COUNT(*) as count FROM content WHERE book_id = ? AND status = 'published'").get(bookId) as any).count;
    const campaignCount = (db.prepare('SELECT COUNT(*) as count FROM campaigns WHERE book_id = ?').get(bookId) as any).count;

    const analytics = db.prepare(`
      SELECT source, metric, SUM(value) as total
      FROM analytics
      WHERE book_id = ?
      GROUP BY source, metric
    `).all(bookId);

    return {
      bookId,
      contentCount,
      publishedCount,
      campaignCount,
      analytics,
    };
  }

  // Get content performance rankings
  getTopContent(limit: number = 10): any[] {
    const db = getDb();
    return db.prepare(`
      SELECT c.*, b.title as book_title, b.asin
      FROM content c
      LEFT JOIN books b ON c.book_id = b.id
      WHERE c.status = 'published'
      ORDER BY c.updated_at DESC
      LIMIT ?
    `).all(limit);
  }

  // Generate analytics report
  generateReport(startDate: string, endDate: string): any {
    const db = getDb();

    const metrics = db.prepare(`
      SELECT
        source,
        metric,
        SUM(value) as total,
        AVG(value) as average,
        MIN(value) as min_value,
        MAX(value) as max_value,
        COUNT(*) as data_points
      FROM analytics
      WHERE date >= ? AND date <= ?
      GROUP BY source, metric
      ORDER BY source, metric
    `).all(startDate, endDate);

    const contentCreated = (db.prepare(`
      SELECT COUNT(*) as count FROM content
      WHERE created_at >= ? AND created_at <= ?
    `).get(startDate, endDate + 'T23:59:59') as any).count;

    const campaignsRun = (db.prepare(`
      SELECT COUNT(*) as count FROM campaigns
      WHERE created_at >= ? AND created_at <= ?
    `).get(startDate, endDate + 'T23:59:59') as any).count;

    return {
      period: { startDate, endDate },
      metrics,
      contentCreated,
      campaignsRun,
      generatedAt: new Date().toISOString(),
    };
  }
}

export const analyticsTracker = new AnalyticsTracker();
