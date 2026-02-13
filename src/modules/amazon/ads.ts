import { getDb, logActivity } from '../../database';
import { generateId } from '../../utils/helpers';
import { approvalWorkflow } from '../../core/approval';
import { aiEngine } from '../../core/ai-engine';
import logger from '../../utils/logger';

export interface AdCampaign {
  id: string;
  bookId: string;
  name: string;
  type: 'sponsored_products' | 'sponsored_brands' | 'lockscreen';
  status: 'draft' | 'pending_approval' | 'active' | 'paused' | 'completed';
  dailyBudget: number;
  totalBudget: number;
  bidStrategy: 'auto' | 'manual';
  keywords: AdKeyword[];
  startDate: string;
  endDate: string;
  performance: AdPerformance;
}

interface AdKeyword {
  keyword: string;
  matchType: 'broad' | 'phrase' | 'exact';
  bid: number;
  status: 'active' | 'paused';
}

interface AdPerformance {
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  acos: number; // Advertising Cost of Sales
  orders: number;
}

export class AmazonAdsManager {
  // Create a new ad campaign (requires approval for any budget)
  async createCampaign(
    bookId: string,
    name: string,
    type: AdCampaign['type'],
    dailyBudget: number,
    totalBudget: number,
    keywords: string[]
  ): Promise<{ campaign: any; approvalId: string }> {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any;

    if (!book) throw new Error(`Book not found: ${bookId}`);

    // ALL ad campaigns require financial approval
    const approval = approvalWorkflow.createRequest(
      'ad_spend',
      `Create Amazon ${type} campaign: "${name}"`,
      `Campaign for "${book.title}" (${book.asin})\n` +
        `Daily Budget: $${dailyBudget}\n` +
        `Total Budget: $${totalBudget}\n` +
        `Keywords: ${keywords.join(', ')}`,
      totalBudget,
      { bookId, type, dailyBudget, keywords }
    );

    // Save campaign as draft (pending approval)
    const campaignId = generateId();
    db.prepare(`
      INSERT INTO campaigns (id, book_id, name, type, status, channel, config, budget)
      VALUES (?, ?, ?, ?, 'pending_approval', 'amazon_ads', ?, ?)
    `).run(
      campaignId,
      bookId,
      name,
      type,
      JSON.stringify({ dailyBudget, keywords, bidStrategy: 'auto', approvalId: approval.id }),
      totalBudget
    );

    logActivity('ad_campaign_created', 'campaign', campaignId, {
      name,
      type,
      totalBudget,
      approvalId: approval.id,
    });

    logger.info('Ad campaign created (pending approval)', {
      campaignId,
      approvalId: approval.id,
      totalBudget,
    });

    return { campaign: { id: campaignId, name, type, status: 'pending_approval' }, approvalId: approval.id };
  }

  // Generate keyword suggestions for ads
  async generateAdKeywords(asin: string): Promise<AdKeyword[]> {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE asin = ?').get(asin) as any;

    if (!book) throw new Error(`Book not found: ${asin}`);

    const response = await aiEngine.generate(
      `Generate Amazon Sponsored Products ad keywords for this fiction book:
Title: ${book.title}
Genre: ${book.genre}
Description: ${book.description}

Generate 30 keywords across these categories:
1. Genre keywords (e.g., "sci-fi thriller books")
2. Theme keywords (based on the book's themes)
3. Comparable author keywords (similar well-known authors)
4. Reader intent keywords (e.g., "books to read this weekend")
5. Niche-specific keywords

For each keyword, suggest:
- Match type (broad, phrase, or exact)
- Suggested bid ($0.15-$1.50 range)

Return as JSON array:
[{"keyword": "keyword", "matchType": "broad", "bid": 0.35, "status": "active"}]`,
      'You are an Amazon Advertising keyword strategist.'
    );

    try {
      return JSON.parse(response.content);
    } catch {
      return [];
    }
  }

  // Generate ad copy for Sponsored Brands
  async generateAdCopy(asin: string): Promise<{ headlines: string[]; descriptions: string[] }> {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE asin = ?').get(asin) as any;

    if (!book) throw new Error(`Book not found: ${asin}`);

    const response = await aiEngine.generate(
      `Write Amazon Sponsored Brands ad copy for this book:
Title: ${book.title}
Genre: ${book.genre}

Generate:
- 5 headlines (max 50 characters each)
- 5 descriptions (max 150 characters each)

Focus on: emotional hooks, genre appeal, reader curiosity, urgency
Return as JSON: {"headlines": [...], "descriptions": [...]}`,
      'You are an expert Amazon advertising copywriter.'
    );

    try {
      return JSON.parse(response.content);
    } catch {
      return { headlines: [], descriptions: [] };
    }
  }

  // Get all campaigns for a book
  getCampaigns(bookId?: string): any[] {
    const db = getDb();
    if (bookId) {
      return db.prepare('SELECT * FROM campaigns WHERE book_id = ? ORDER BY created_at DESC').all(bookId);
    }
    return db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
  }

  // Update campaign status (after approval)
  updateCampaignStatus(campaignId: string, status: string): void {
    const db = getDb();
    db.prepare('UPDATE campaigns SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
      status,
      campaignId
    );
    logActivity('campaign_status_updated', 'campaign', campaignId, { status });
  }

  // Get campaign performance summary
  getCampaignPerformance(campaignId: string): AdPerformance {
    const db = getDb();
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as any;

    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

    // Return stored performance or defaults
    const config = JSON.parse(campaign.config || '{}');
    return config.performance || {
      impressions: 0,
      clicks: 0,
      spend: campaign.spent || 0,
      sales: 0,
      acos: 0,
      orders: 0,
    };
  }
}

export const amazonAdsManager = new AmazonAdsManager();
