import { Router, Request, Response } from 'express';
import { amazonAdsManager } from '../modules/amazon/ads';
import { socialMediaManager } from '../modules/social/manager';
import logger from '../utils/logger';

const router = Router();

// GET /api/campaigns - List all campaigns
router.get('/', (req: Request, res: Response) => {
  try {
    const { bookId } = req.query;
    const campaigns = amazonAdsManager.getCampaigns(bookId as string);
    res.json({ success: true, data: campaigns });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/campaigns/ads - Create Amazon ad campaign (requires approval)
router.post('/ads', async (req: Request, res: Response) => {
  try {
    const { bookId, name, type, dailyBudget, totalBudget, keywords } = req.body;

    if (!bookId || !name) {
      return res.status(400).json({ success: false, error: 'bookId and name are required' });
    }

    const result = await amazonAdsManager.createCampaign(
      bookId,
      name,
      type || 'sponsored_products',
      dailyBudget || 5,
      totalBudget || 100,
      keywords || []
    );

    res.json({
      success: true,
      data: result.campaign,
      approvalRequired: true,
      approvalId: result.approvalId,
      message: 'Campaign created. Awaiting financial approval before activation.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/campaigns/ads/keywords - Generate ad keywords
router.post('/ads/keywords', async (req: Request, res: Response) => {
  try {
    const { asin } = req.body;
    if (!asin) return res.status(400).json({ success: false, error: 'ASIN required' });

    const keywords = await amazonAdsManager.generateAdKeywords(asin);
    res.json({ success: true, data: keywords });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/campaigns/ads/copy - Generate ad copy
router.post('/ads/copy', async (req: Request, res: Response) => {
  try {
    const { asin } = req.body;
    if (!asin) return res.status(400).json({ success: false, error: 'ASIN required' });

    const copy = await amazonAdsManager.generateAdCopy(asin);
    res.json({ success: true, data: copy });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/campaigns/social/promote - Create paid social promotion (requires approval)
router.post('/social/promote', async (req: Request, res: Response) => {
  try {
    const { bookId, platform, budget, duration } = req.body;

    if (!bookId || !platform || !budget) {
      return res.status(400).json({ success: false, error: 'bookId, platform, and budget are required' });
    }

    const result = await socialMediaManager.createPaidPromotion(
      bookId,
      platform,
      budget,
      duration || 7
    );

    res.json({
      success: true,
      approvalRequired: true,
      approvalId: result.approvalId,
      message: `Paid ${platform} promotion request created. Awaiting financial approval.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
