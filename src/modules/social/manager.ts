import { getDb, logActivity } from '../../database';
import { generateId } from '../../utils/helpers';
import { aiEngine } from '../../core/ai-engine';
import { approvalWorkflow } from '../../core/approval';
import logger from '../../utils/logger';

export interface SocialPost {
  id: string;
  bookId: string;
  platform: 'twitter' | 'instagram' | 'facebook' | 'tiktok';
  content: string;
  mediaUrls: string[];
  hashtags: string[];
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  scheduledFor: string | null;
  publishedAt: string | null;
  performance: SocialPerformance;
}

interface SocialPerformance {
  likes: number;
  shares: number;
  comments: number;
  clicks: number;
  impressions: number;
  reach: number;
}

export class SocialMediaManager {
  // Generate and save a social media post
  async createPost(
    bookId: string,
    platform: SocialPost['platform'],
    customPrompt?: string
  ): Promise<SocialPost> {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any;

    if (!book) throw new Error(`Book not found: ${bookId}`);

    let content: string;

    if (customPrompt) {
      const response = await aiEngine.generate(
        `${customPrompt}\n\nBook: ${book.title}\nDescription: ${book.description}\nAmazon URL: ${book.amazon_url}`,
        `You are a social media marketing expert for books. Create a ${platform} post.`
      );
      content = response.content;
    } else {
      content = await aiEngine.generateSocialPost(
        book.title,
        book.description,
        platform
      );
    }

    const id = generateId();
    const hashtags = content.match(/#\w+/g) || [];

    db.prepare(`
      INSERT INTO content (id, book_id, type, title, body, platform, status, metadata)
      VALUES (?, ?, 'social_post', ?, ?, ?, 'draft', ?)
    `).run(
      id,
      bookId,
      `${platform} post`,
      content,
      platform,
      JSON.stringify({ hashtags })
    );

    logActivity('social_post_created', 'content', id, { platform, bookTitle: book.title });
    logger.info('Social post created', { id, platform });

    return {
      id,
      bookId,
      platform,
      content,
      mediaUrls: [],
      hashtags,
      status: 'draft',
      scheduledFor: null,
      publishedAt: null,
      performance: { likes: 0, shares: 0, comments: 0, clicks: 0, impressions: 0, reach: 0 },
    };
  }

  // Generate posts for all platforms at once
  async createMultiPlatformPosts(bookId: string): Promise<SocialPost[]> {
    const platforms: SocialPost['platform'][] = ['twitter', 'instagram', 'facebook', 'tiktok'];
    const posts: SocialPost[] = [];

    for (const platform of platforms) {
      try {
        const post = await this.createPost(bookId, platform);
        posts.push(post);
      } catch (error: any) {
        logger.error(`Failed to create ${platform} post`, { error: error.message });
      }
    }

    return posts;
  }

  // Schedule a post for publishing
  schedulePost(postId: string, scheduledFor: string): void {
    const db = getDb();
    db.prepare(`
      UPDATE content SET status = 'scheduled', scheduled_for = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(scheduledFor, postId);

    logActivity('post_scheduled', 'content', postId, { scheduledFor });
    logger.info('Post scheduled', { postId, scheduledFor });
  }

  // Publish a post to the platform (calls platform-specific APIs)
  async publishPost(postId: string): Promise<boolean> {
    const db = getDb();
    const post = db.prepare('SELECT * FROM content WHERE id = ?').get(postId) as any;

    if (!post) throw new Error(`Post not found: ${postId}`);

    try {
      // Platform-specific publishing logic
      let success = false;

      switch (post.platform) {
        case 'twitter':
          success = await this.publishToTwitter(post.body);
          break;
        case 'instagram':
          success = await this.publishToInstagram(post.body);
          break;
        case 'facebook':
          success = await this.publishToFacebook(post.body);
          break;
        case 'tiktok':
          success = await this.publishToTikTok(post.body);
          break;
      }

      if (success) {
        db.prepare(`
          UPDATE content SET status = 'published', published_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `).run(postId);

        logActivity('post_published', 'content', postId, { platform: post.platform });
        logger.info('Post published', { postId, platform: post.platform });
      }

      return success;
    } catch (error: any) {
      db.prepare(`
        UPDATE content SET status = 'failed', metadata = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify({ error: error.message }), postId);

      logger.error('Post publishing failed', { postId, error: error.message });
      return false;
    }
  }

  // Twitter/X publishing
  private async publishToTwitter(content: string): Promise<boolean> {
    const { config } = require('../../config');
    if (!config.twitter.apiKey) {
      logger.warn('Twitter API not configured. Post saved as draft.');
      return false;
    }

    // Twitter API v2 post
    const axios = require('axios');
    const crypto = require('crypto');

    try {
      await axios.post(
        'https://api.twitter.com/2/tweets',
        { text: content },
        {
          headers: {
            Authorization: `Bearer ${config.twitter.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return true;
    } catch (error: any) {
      logger.error('Twitter publish failed', { error: error.message });
      return false;
    }
  }

  // Instagram publishing (via Facebook Graph API)
  private async publishToInstagram(content: string): Promise<boolean> {
    const { config } = require('../../config');
    if (!config.facebook.instagramBusinessId) {
      logger.warn('Instagram API not configured. Post saved as draft.');
      return false;
    }

    try {
      const axios = require('axios');
      // Instagram requires an image - this would need a media URL
      await axios.post(
        `https://graph.facebook.com/v18.0/${config.facebook.instagramBusinessId}/media`,
        {
          caption: content,
          access_token: config.facebook.pageToken,
        }
      );
      return true;
    } catch (error: any) {
      logger.error('Instagram publish failed', { error: error.message });
      return false;
    }
  }

  // Facebook publishing
  private async publishToFacebook(content: string): Promise<boolean> {
    const { config } = require('../../config');
    if (!config.facebook.pageToken) {
      logger.warn('Facebook API not configured. Post saved as draft.');
      return false;
    }

    try {
      const axios = require('axios');
      await axios.post(
        `https://graph.facebook.com/v18.0/me/feed`,
        {
          message: content,
          access_token: config.facebook.pageToken,
        }
      );
      return true;
    } catch (error: any) {
      logger.error('Facebook publish failed', { error: error.message });
      return false;
    }
  }

  // TikTok publishing (content creator API)
  private async publishToTikTok(content: string): Promise<boolean> {
    const { config } = require('../../config');
    if (!config.tiktok.clientKey) {
      logger.warn('TikTok API not configured. Post saved as draft.');
      return false;
    }

    // TikTok requires video content - save the script as a draft
    logger.info('TikTok content saved as script/draft for manual video creation');
    return false;
  }

  // Get all posts with optional filters
  getPosts(bookId?: string, platform?: string, status?: string): any[] {
    const db = getDb();
    let query = "SELECT * FROM content WHERE type = 'social_post'";
    const params: any[] = [];

    if (bookId) {
      query += ' AND book_id = ?';
      params.push(bookId);
    }
    if (platform) {
      query += ' AND platform = ?';
      params.push(platform);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(...params);
  }

  // Create a paid promotion (requires approval)
  async createPaidPromotion(
    bookId: string,
    platform: string,
    budget: number,
    duration: number
  ): Promise<{ approvalId: string }> {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any;

    const approval = approvalWorkflow.createRequest(
      'paid_promotion',
      `Paid ${platform} promotion`,
      `Promote "${book?.title || bookId}" on ${platform}\nBudget: $${budget}\nDuration: ${duration} days`,
      budget,
      { bookId, platform, duration }
    );

    logger.info('Paid promotion request created', { approvalId: approval.id, platform, budget });
    return { approvalId: approval.id };
  }

  // Generate a content calendar for social media
  async generateCalendar(bookId: string, weeks: number = 4): Promise<any[]> {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any;

    if (!book) throw new Error(`Book not found: ${bookId}`);

    return aiEngine.generateContentCalendar(book.title, book.genre, weeks);
  }
}

export const socialMediaManager = new SocialMediaManager();
