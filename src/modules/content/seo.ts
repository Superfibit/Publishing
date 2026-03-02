import axios from 'axios';
import { config } from '../../config';
import { aiEngine } from '../../core/ai-engine';
import { getDb, logActivity } from '../../database';
import { generateId } from '../../utils/helpers';
import logger from '../../utils/logger';

export interface KeywordData {
  keyword: string;
  category: 'primary' | 'secondary' | 'longtail';
  searchVolume?: string;
  competition?: string;
  suggestedBid?: string;
}

export interface SEOAudit {
  bookId: string;
  keywords: { primary: string[]; secondary: string[]; longtail: string[] };
  competitorAnalysis: any[];
  contentGaps: string[];
  recommendations: string[];
}

export class SEOEngine {
  // Generate keyword research for a book
  async researchKeywords(bookId: string): Promise<SEOAudit['keywords']> {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any;

    if (!book) throw new Error(`Book not found: ${bookId}`);

    const keywords = await aiEngine.generateKeywords(
      book.title,
      book.genre,
      book.description
    );

    // Store keywords
    db.prepare(`
      UPDATE books SET keywords = ?, updated_at = datetime('now') WHERE id = ?
    `).run(JSON.stringify([...keywords.primary, ...keywords.secondary]), bookId);

    db.prepare(`
      INSERT INTO content (id, book_id, type, title, body, platform, status, metadata)
      VALUES (?, ?, 'keyword_research', 'SEO Keyword Research', ?, 'seo', 'completed', ?)
    `).run(
      generateId(),
      bookId,
      JSON.stringify(keywords),
      JSON.stringify({ generatedAt: new Date().toISOString() })
    );

    logActivity('keywords_researched', 'book', bookId, {
      primaryCount: keywords.primary.length,
      secondaryCount: keywords.secondary.length,
      longtailCount: keywords.longtail.length,
    });

    logger.info('Keyword research completed', { bookId });
    return keywords;
  }

  // Perform a full SEO audit for a book's marketing
  async performAudit(bookId: string): Promise<SEOAudit> {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any;

    if (!book) throw new Error(`Book not found: ${bookId}`);

    // Get keywords
    const keywords = await this.researchKeywords(bookId);

    // Get content gaps analysis
    const response = await aiEngine.generate(
      `Perform an SEO content gap analysis for marketing this fiction book:
Title: ${book.title}
Genre: ${book.genre}
Description: ${book.description}
Current Keywords: ${JSON.stringify(keywords.primary)}

Analyze and return JSON:
{
  "contentGaps": ["topics/keywords we should create content for but haven't"],
  "competitorInsights": ["what successful similar books are doing for SEO"],
  "recommendations": ["specific actionable SEO recommendations"],
  "monthlyPlan": ["month-by-month SEO content strategy for 3 months"]
}`,
      'You are a book marketing SEO specialist.'
    );

    let analysis: any;
    try {
      analysis = JSON.parse(response.content);
    } catch {
      analysis = {
        contentGaps: [],
        competitorInsights: [],
        recommendations: [response.content],
        monthlyPlan: [],
      };
    }

    const audit: SEOAudit = {
      bookId,
      keywords,
      competitorAnalysis: analysis.competitorInsights || [],
      contentGaps: analysis.contentGaps || [],
      recommendations: analysis.recommendations || [],
    };

    // Store audit results
    db.prepare(`
      INSERT INTO content (id, book_id, type, title, body, platform, status, metadata)
      VALUES (?, ?, 'seo_audit', 'SEO Audit Report', ?, 'seo', 'completed', ?)
    `).run(
      generateId(),
      bookId,
      JSON.stringify(audit),
      JSON.stringify({ generatedAt: new Date().toISOString() })
    );

    logActivity('seo_audit_performed', 'book', bookId, {});
    logger.info('SEO audit completed', { bookId });

    return audit;
  }

  // Google search for competitor research
  async searchCompetitors(query: string): Promise<any[]> {
    if (!config.google.apiKey || !config.google.searchEngineId) {
      logger.warn('Google API not configured for competitor search');
      return [];
    }

    try {
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: config.google.apiKey,
          cx: config.google.searchEngineId,
          q: query,
          num: 10,
        },
      });

      return response.data.items?.map((item: any) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
      })) || [];
    } catch (error: any) {
      logger.error('Google search failed', { error: error.message });
      return [];
    }
  }

  // Generate SEO-optimized meta tags
  async generateMetaTags(
    bookId: string,
    pageType: 'landing' | 'blog' | 'author'
  ): Promise<{ title: string; description: string; keywords: string; ogTags: Record<string, string> }> {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any;

    if (!book) throw new Error(`Book not found: ${bookId}`);

    const response = await aiEngine.generate(
      `Generate SEO meta tags for a ${pageType} page promoting this book:
Title: ${book.title}
Author: ${book.author}
Genre: ${book.genre}

Return JSON:
{
  "title": "Page title (60 chars max)",
  "description": "Meta description (155 chars max)",
  "keywords": "comma,separated,keywords",
  "ogTags": {
    "og:title": "...",
    "og:description": "...",
    "og:type": "book",
    "og:image": "${book.cover_image_url}"
  }
}`
    );

    try {
      return JSON.parse(response.content);
    } catch {
      return {
        title: `${book.title} by ${book.author}`,
        description: book.description?.substring(0, 155) || '',
        keywords: book.genre,
        ogTags: { 'og:title': book.title, 'og:type': 'book' },
      };
    }
  }
}

export const seoEngine = new SEOEngine();
