import { aiEngine } from '../../core/ai-engine';
import { getDb, logActivity } from '../../database';
import { generateId } from '../../utils/helpers';
import logger from '../../utils/logger';

export interface ListingOptimization {
  bookId: string;
  asin: string;
  titleSuggestions: string[];
  descriptionSuggestion: string;
  keywordSuggestions: string[];
  categoryRecommendations: string[];
  pricingInsights: string;
  a10Checklist: A10ChecklistItem[];
}

interface A10ChecklistItem {
  factor: string;
  status: 'good' | 'needs_improvement' | 'critical';
  recommendation: string;
}

export class AmazonOptimizer {
  // Generate full listing optimization for a book
  async optimizeListing(asin: string): Promise<ListingOptimization> {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE asin = ?').get(asin) as any;

    if (!book) {
      throw new Error(`Book not found: ${asin}`);
    }

    const keywords = JSON.parse(book.keywords || '[]');

    // Get AI-powered optimization suggestions
    const optimization = await aiEngine.generateListingOptimization(
      book.title,
      book.description,
      keywords,
      book.genre
    );

    // Generate A10 algorithm checklist
    const a10Checklist = this.generateA10Checklist(book);

    const result: ListingOptimization = {
      bookId: book.id,
      asin,
      ...optimization,
      a10Checklist,
    };

    // Store as content item
    db.prepare(`
      INSERT INTO content (id, book_id, type, title, body, platform, status, metadata)
      VALUES (?, ?, 'listing_optimization', 'Amazon Listing Optimization', ?, 'amazon', 'draft', ?)
    `).run(
      generateId(),
      book.id,
      JSON.stringify(result),
      JSON.stringify({ asin, generatedAt: new Date().toISOString() })
    );

    logActivity('listing_optimized', 'book', asin, { title: book.title });
    logger.info('Listing optimization generated', { asin });

    return result;
  }

  // Amazon A10 Algorithm checklist
  private generateA10Checklist(book: any): A10ChecklistItem[] {
    const checklist: A10ChecklistItem[] = [];

    // Title optimization
    const titleLength = (book.title || '').length;
    checklist.push({
      factor: 'Title Length & Keywords',
      status: titleLength > 60 && titleLength < 200 ? 'good' : titleLength === 0 ? 'critical' : 'needs_improvement',
      recommendation:
        titleLength === 0
          ? 'Title is missing. Fetch book data from Amazon first.'
          : titleLength < 60
            ? 'Title is too short. Include genre keywords and series info.'
            : titleLength > 200
              ? 'Title is too long. Keep under 200 characters.'
              : 'Title length is good. Ensure it includes primary keywords.',
    });

    // Description
    const descLength = (book.description || '').length;
    checklist.push({
      factor: 'Book Description',
      status: descLength > 500 ? 'good' : descLength === 0 ? 'critical' : 'needs_improvement',
      recommendation:
        descLength === 0
          ? 'No description found. Add a compelling 1000+ character description with HTML formatting.'
          : descLength < 500
            ? 'Description is too short. Aim for 1000-2000 characters with keyword-rich copy.'
            : 'Description length is solid. Ensure it has emotional hooks and a clear CTA.',
    });

    // Keywords
    const keywords = JSON.parse(book.keywords || '[]');
    checklist.push({
      factor: 'Backend Keywords',
      status: keywords.length >= 7 ? 'good' : keywords.length === 0 ? 'critical' : 'needs_improvement',
      recommendation:
        keywords.length === 0
          ? 'No keywords set. Add 7 keyword phrases (each up to 50 chars) targeting reader search terms.'
          : keywords.length < 7
            ? `Only ${keywords.length}/7 keyword slots used. Fill all 7 slots with unique, relevant search terms.`
            : 'All keyword slots filled. Review for search volume and relevance.',
    });

    // Categories
    checklist.push({
      factor: 'Category Selection',
      status: 'needs_improvement',
      recommendation:
        'Ensure you are in 2-3 relevant categories. Use Amazon\'s "category request" to get into niche categories with less competition.',
    });

    // Cover
    checklist.push({
      factor: 'Book Cover',
      status: book.cover_image_url ? 'good' : 'critical',
      recommendation: book.cover_image_url
        ? 'Cover image exists. Ensure it is high-resolution (2560x1600px for Kindle) and genre-appropriate.'
        : 'No cover image found. A professional cover is critical for click-through rate.',
    });

    // Reviews
    const metadata = JSON.parse(book.metadata || '{}');
    checklist.push({
      factor: 'Reviews & Social Proof',
      status: 'needs_improvement',
      recommendation:
        'Active review generation is key. Use email follow-ups, ARC teams, and reader engagement to build reviews.',
    });

    // Price
    checklist.push({
      factor: 'Pricing Strategy',
      status: book.price ? 'good' : 'needs_improvement',
      recommendation: book.price
        ? `Current price: ${book.price}. Test different price points. $0.99-$2.99 for visibility, $3.99-$9.99 for revenue.`
        : 'Set competitive pricing. Research your genre\'s typical price range.',
    });

    return checklist;
  }

  // Generate A+ Content suggestions
  async generateAPlusContent(asin: string): Promise<any> {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE asin = ?').get(asin) as any;

    if (!book) throw new Error(`Book not found: ${asin}`);

    const response = await aiEngine.generate(
      `Create A+ Content (Enhanced Brand Content) suggestions for this Amazon book listing:
      Title: ${book.title}
      Author: ${book.author}
      Genre: ${book.genre}
      Description: ${book.description}

      Suggest 5 A+ content modules with:
      1. Comparison chart (vs similar books)
      2. Author story module
      3. Key themes/features highlight
      4. Reader testimonials layout
      5. Series/related books showcase

      For each module provide:
      - Module type
      - Headline text
      - Body copy
      - Image suggestions (describe what images to use)

      Return as JSON array.`,
      'You are an Amazon KDP A+ Content specialist.'
    );

    try {
      return JSON.parse(response.content);
    } catch {
      return { raw: response.content };
    }
  }
}

export const amazonOptimizer = new AmazonOptimizer();
