import { Router, Request, Response } from 'express';
import { analyticsTracker } from '../modules/analytics/tracker';

const router = Router();

// GET /api/analytics/dashboard - Get dashboard stats
router.get('/dashboard', (_req: Request, res: Response) => {
  try {
    const stats = analyticsTracker.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/analytics/book/:id - Get book performance
router.get('/book/:id', (req: Request, res: Response) => {
  try {
    const performance = analyticsTracker.getBookPerformance(req.params.id);
    res.json({ success: true, data: performance });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/analytics/book/:id/data - Get book analytics data
router.get('/book/:id/data', (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const data = analyticsTracker.getBookAnalytics(
      req.params.id,
      (startDate as string) || thirtyDaysAgo,
      (endDate as string) || today
    );
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/analytics/top-content - Get top performing content
router.get('/top-content', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const content = analyticsTracker.getTopContent(limit);
    res.json({ success: true, data: content });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/analytics/report - Generate analytics report
router.get('/report', (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const report = analyticsTracker.generateReport(
      (startDate as string) || thirtyDaysAgo,
      (endDate as string) || today
    );
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/analytics/record - Record a data point
router.post('/record', (req: Request, res: Response) => {
  try {
    const { bookId, source, metric, value } = req.body;
    if (!bookId || !source || !metric || value === undefined) {
      return res.status(400).json({ success: false, error: 'bookId, source, metric, and value required' });
    }

    analyticsTracker.record(bookId, source, metric, value);
    res.json({ success: true, message: 'Data point recorded' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
