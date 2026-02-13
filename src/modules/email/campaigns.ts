import nodemailer from 'nodemailer';
import { config } from '../../config';
import { getDb, logActivity } from '../../database';
import { generateId } from '../../utils/helpers';
import { aiEngine } from '../../core/ai-engine';
import { approvalWorkflow } from '../../core/approval';
import logger from '../../utils/logger';

export class EmailCampaignManager {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
    });
  }

  // Create an email campaign
  async createCampaign(
    bookId: string,
    emailType: 'welcome' | 'promotion' | 'newsletter' | 'launch' | 'review_request',
    customSubject?: string
  ): Promise<any> {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any;

    if (!book) throw new Error(`Book not found: ${bookId}`);

    // Generate email content using AI
    const emailContent = await aiEngine.generateEmailCopy(
      book.title,
      book.description,
      emailType
    );

    const subject = customSubject || emailContent.subject;

    // Replace placeholders
    const bodyHtml = emailContent.bodyHtml
      .replace(/\{\{AMAZON_LINK\}\}/g, book.amazon_url)
      .replace(/\{\{BOOK_TITLE\}\}/g, book.title)
      .replace(/\{\{AUTHOR_NAME\}\}/g, book.author);

    const bodyText = emailContent.bodyText
      .replace(/\{\{AMAZON_LINK\}\}/g, book.amazon_url)
      .replace(/\{\{BOOK_TITLE\}\}/g, book.title)
      .replace(/\{\{AUTHOR_NAME\}\}/g, book.author);

    const id = generateId();

    db.prepare(`
      INSERT INTO email_campaigns (id, name, subject, body_html, body_text, status)
      VALUES (?, ?, ?, ?, ?, 'draft')
    `).run(id, `${emailType} - ${book.title}`, subject, bodyHtml, bodyText);

    logActivity('email_campaign_created', 'email_campaign', id, { emailType, bookTitle: book.title });
    logger.info('Email campaign created', { id, emailType });

    return {
      id,
      name: `${emailType} - ${book.title}`,
      subject,
      bodyHtml,
      bodyText,
      status: 'draft',
    };
  }

  // Send a campaign to all subscribers (requires approval if there's any cost)
  async sendCampaign(campaignId: string, testMode: boolean = false): Promise<{ sent: number; failed: number }> {
    const db = getDb();
    const campaign = db.prepare('SELECT * FROM email_campaigns WHERE id = ?').get(campaignId) as any;

    if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

    // Get active subscribers
    const subscribers = testMode
      ? [{ email: config.approval.email, name: 'Test User' }]
      : (db.prepare("SELECT * FROM email_subscribers WHERE status = 'active'").all() as any[]);

    if (subscribers.length === 0) {
      logger.warn('No subscribers to send to');
      return { sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const subscriber of subscribers) {
      try {
        const personalizedHtml = campaign.body_html
          .replace(/\{\{FIRST_NAME\}\}/g, subscriber.name?.split(' ')[0] || 'Reader')
          .replace(/\{\{UNSUBSCRIBE_LINK\}\}/g, `#unsubscribe-${subscriber.id || 'test'}`);

        const personalizedText = campaign.body_text
          .replace(/\{\{FIRST_NAME\}\}/g, subscriber.name?.split(' ')[0] || 'Reader')
          .replace(/\{\{UNSUBSCRIBE_LINK\}\}/g, `#unsubscribe-${subscriber.id || 'test'}`);

        await this.transporter.sendMail({
          from: `"${config.email.fromName}" <${config.email.from}>`,
          to: subscriber.email,
          subject: campaign.subject,
          text: personalizedText,
          html: personalizedHtml,
        });

        sent++;
      } catch (error: any) {
        logger.error('Failed to send email', {
          to: subscriber.email,
          error: error.message,
        });
        failed++;
      }
    }

    // Update campaign stats
    db.prepare(`
      UPDATE email_campaigns SET
        status = 'sent',
        sent_count = ?,
        sent_at = datetime('now')
      WHERE id = ?
    `).run(sent, campaignId);

    logActivity('email_campaign_sent', 'email_campaign', campaignId, { sent, failed });
    logger.info('Email campaign sent', { campaignId, sent, failed });

    return { sent, failed };
  }

  // Add a subscriber
  addSubscriber(email: string, name: string = '', source: string = 'manual', tags: string[] = []): any {
    const db = getDb();
    const id = generateId();

    try {
      db.prepare(`
        INSERT INTO email_subscribers (id, email, name, source, tags)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, email, name, source, JSON.stringify(tags));

      logActivity('subscriber_added', 'subscriber', id, { email, source });
      return { id, email, name, source, status: 'active' };
    } catch (error: any) {
      if (error.message.includes('UNIQUE')) {
        logger.warn('Subscriber already exists', { email });
        return db.prepare('SELECT * FROM email_subscribers WHERE email = ?').get(email);
      }
      throw error;
    }
  }

  // Remove/unsubscribe
  unsubscribe(email: string): void {
    const db = getDb();
    db.prepare(`
      UPDATE email_subscribers SET status = 'unsubscribed', unsubscribed_at = datetime('now')
      WHERE email = ?
    `).run(email);
    logActivity('subscriber_unsubscribed', 'subscriber', '', { email });
  }

  // Get subscriber count
  getSubscriberStats(): { total: number; active: number; unsubscribed: number } {
    const db = getDb();
    const total = (db.prepare('SELECT COUNT(*) as count FROM email_subscribers').get() as any).count;
    const active = (db.prepare("SELECT COUNT(*) as count FROM email_subscribers WHERE status = 'active'").get() as any).count;
    const unsubscribed = (db.prepare("SELECT COUNT(*) as count FROM email_subscribers WHERE status = 'unsubscribed'").get() as any).count;
    return { total, active, unsubscribed };
  }

  // Get all campaigns
  getCampaigns(status?: string): any[] {
    const db = getDb();
    if (status) {
      return db.prepare('SELECT * FROM email_campaigns WHERE status = ? ORDER BY created_at DESC').all(status);
    }
    return db.prepare('SELECT * FROM email_campaigns ORDER BY created_at DESC').all();
  }

  // Get all subscribers
  getSubscribers(status?: string): any[] {
    const db = getDb();
    if (status) {
      return db.prepare('SELECT * FROM email_subscribers WHERE status = ? ORDER BY subscribed_at DESC').all(status);
    }
    return db.prepare('SELECT * FROM email_subscribers ORDER BY subscribed_at DESC').all();
  }

  // Schedule campaign for paid email service (requires approval)
  async schedulePaidCampaign(
    campaignId: string,
    scheduledFor: string,
    estimatedCost: number
  ): Promise<{ approvalId: string }> {
    const approval = approvalWorkflow.createRequest(
      'email_campaign',
      `Send email campaign`,
      `Campaign ID: ${campaignId}\nScheduled for: ${scheduledFor}\nEstimated cost: $${estimatedCost}`,
      estimatedCost,
      { campaignId, scheduledFor }
    );

    logger.info('Paid email campaign scheduled (pending approval)', {
      campaignId,
      approvalId: approval.id,
      estimatedCost,
    });

    return { approvalId: approval.id };
  }
}

export const emailCampaignManager = new EmailCampaignManager();
