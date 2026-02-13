import { Router, Request, Response } from 'express';
import { getDb } from '../database';
import { socialMediaManager } from '../modules/social/manager';
import { blogGenerator } from '../modules/content/blog';
import { seoEngine } from '../modules/content/seo';
import { landingPageGenerator } from '../modules/content/landing';
import { emailCampaignManager } from '../modules/email/campaigns';
import logger from '../utils/logger';

const router = Router();

// GET /api/content - List all content
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { bookId, type, status, platform } = req.query;
    let query = 'SELECT c.*, b.title as book_title, b.asin FROM content c LEFT JOIN books b ON c.book_id = b.id WHERE 1=1';
    const params: any[] = [];

    if (bookId) { query += ' AND c.book_id = ?'; params.push(bookId); }
    if (type) { query += ' AND c.type = ?'; params.push(type); }
    if (status) { query += ' AND c.status = ?'; params.push(status); }
    if (platform) { query += ' AND c.platform = ?'; params.push(platform); }

    query += ' ORDER BY c.created_at DESC LIMIT 100';
    const content = db.prepare(query).all(...params);
    res.json({ success: true, data: content });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/content/:id - Get single content item
router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const content = db.prepare('SELECT * FROM content WHERE id = ?').get(req.params.id);
    if (!content) return res.status(404).json({ success: false, error: 'Content not found' });
    res.json({ success: true, data: content });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/content/:id - Update content
router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { title, body, status } = req.body;

    db.prepare(`
      UPDATE content SET
        title = COALESCE(?, title),
        body = COALESCE(?, body),
        status = COALESCE(?, status),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(title, body, status, req.params.id);

    const updated = db.prepare('SELECT * FROM content WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/content/:id - Delete content
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM content WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Content deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Social Media ===

// POST /api/content/social/generate - Generate social media post
router.post('/social/generate', async (req: Request, res: Response) => {
  try {
    const { bookId, platform, prompt } = req.body;
    if (!bookId || !platform) {
      return res.status(400).json({ success: false, error: 'bookId and platform required' });
    }

    const post = await socialMediaManager.createPost(bookId, platform, prompt);
    res.json({ success: true, data: post });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/content/social/generate-all - Generate posts for all platforms
router.post('/social/generate-all', async (req: Request, res: Response) => {
  try {
    const { bookId } = req.body;
    if (!bookId) return res.status(400).json({ success: false, error: 'bookId required' });

    const posts = await socialMediaManager.createMultiPlatformPosts(bookId);
    res.json({ success: true, data: posts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/content/social/schedule - Schedule a social post
router.post('/social/schedule', (req: Request, res: Response) => {
  try {
    const { postId, scheduledFor } = req.body;
    if (!postId || !scheduledFor) {
      return res.status(400).json({ success: false, error: 'postId and scheduledFor required' });
    }

    socialMediaManager.schedulePost(postId, scheduledFor);
    res.json({ success: true, message: 'Post scheduled' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/content/social/publish - Publish a social post
router.post('/social/publish', async (req: Request, res: Response) => {
  try {
    const { postId } = req.body;
    if (!postId) return res.status(400).json({ success: false, error: 'postId required' });

    const success = await socialMediaManager.publishPost(postId);
    res.json({ success, message: success ? 'Post published' : 'Publishing failed or API not configured' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/content/social/calendar - Generate content calendar
router.post('/social/calendar', async (req: Request, res: Response) => {
  try {
    const { bookId, weeks } = req.body;
    if (!bookId) return res.status(400).json({ success: false, error: 'bookId required' });

    const calendar = await socialMediaManager.generateCalendar(bookId, weeks || 4);
    res.json({ success: true, data: calendar });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Blog ===

// POST /api/content/blog/generate - Generate blog post
router.post('/blog/generate', async (req: Request, res: Response) => {
  try {
    const { bookId, keyword, wordCount } = req.body;
    if (!bookId || !keyword) {
      return res.status(400).json({ success: false, error: 'bookId and keyword required' });
    }

    const post = await blogGenerator.generatePost(bookId, keyword, wordCount || 1500);
    res.json({ success: true, data: post });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/content/blog/pitch - Generate guest post pitch
router.post('/blog/pitch', async (req: Request, res: Response) => {
  try {
    const { bookId, blogName } = req.body;
    if (!bookId || !blogName) {
      return res.status(400).json({ success: false, error: 'bookId and blogName required' });
    }

    const pitch = await blogGenerator.generateGuestPostPitch(bookId, blogName);
    res.json({ success: true, data: pitch });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === SEO ===

// POST /api/content/seo/keywords - Research keywords
router.post('/seo/keywords', async (req: Request, res: Response) => {
  try {
    const { bookId } = req.body;
    if (!bookId) return res.status(400).json({ success: false, error: 'bookId required' });

    const keywords = await seoEngine.researchKeywords(bookId);
    res.json({ success: true, data: keywords });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/content/seo/audit - Full SEO audit
router.post('/seo/audit', async (req: Request, res: Response) => {
  try {
    const { bookId } = req.body;
    if (!bookId) return res.status(400).json({ success: false, error: 'bookId required' });

    const audit = await seoEngine.performAudit(bookId);
    res.json({ success: true, data: audit });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/content/seo/meta - Generate meta tags
router.post('/seo/meta', async (req: Request, res: Response) => {
  try {
    const { bookId, pageType } = req.body;
    if (!bookId) return res.status(400).json({ success: false, error: 'bookId required' });

    const meta = await seoEngine.generateMetaTags(bookId, pageType || 'landing');
    res.json({ success: true, data: meta });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Landing Pages ===

// POST /api/content/landing/generate - Generate landing page
router.post('/landing/generate', async (req: Request, res: Response) => {
  try {
    const { bookId } = req.body;
    if (!bookId) return res.status(400).json({ success: false, error: 'bookId required' });

    const landing = await landingPageGenerator.generateLandingPage(bookId);
    res.json({ success: true, data: landing });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/content/landing/author - Generate author page
router.post('/landing/author', async (req: Request, res: Response) => {
  try {
    const { authorName, bookIds } = req.body;
    if (!authorName || !bookIds) {
      return res.status(400).json({ success: false, error: 'authorName and bookIds required' });
    }

    const page = await landingPageGenerator.generateAuthorPage(authorName, bookIds);
    res.json({ success: true, data: page });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === Email ===

// POST /api/content/email/generate - Generate email campaign
router.post('/email/generate', async (req: Request, res: Response) => {
  try {
    const { bookId, emailType, subject } = req.body;
    if (!bookId || !emailType) {
      return res.status(400).json({ success: false, error: 'bookId and emailType required' });
    }

    const campaign = await emailCampaignManager.createCampaign(bookId, emailType, subject);
    res.json({ success: true, data: campaign });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/content/email/campaigns - List email campaigns
router.get('/email/campaigns', (req: Request, res: Response) => {
  try {
    const campaigns = emailCampaignManager.getCampaigns(req.query.status as string);
    res.json({ success: true, data: campaigns });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/content/email/send - Send email campaign
router.post('/email/send', async (req: Request, res: Response) => {
  try {
    const { campaignId, testMode } = req.body;
    if (!campaignId) return res.status(400).json({ success: false, error: 'campaignId required' });

    const result = await emailCampaignManager.sendCampaign(campaignId, testMode);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/content/email/subscribe - Add subscriber
router.post('/email/subscribe', (req: Request, res: Response) => {
  try {
    const { email, name, source, tags } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'email required' });

    const subscriber = emailCampaignManager.addSubscriber(email, name, source, tags);
    res.json({ success: true, data: subscriber });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/content/email/subscribers - List subscribers
router.get('/email/subscribers', (req: Request, res: Response) => {
  try {
    const subscribers = emailCampaignManager.getSubscribers(req.query.status as string);
    res.json({ success: true, data: subscribers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
