import { aiEngine } from '../../core/ai-engine';
import { getDb, logActivity } from '../../database';
import { generateId, slugify } from '../../utils/helpers';
import logger from '../../utils/logger';

export class LandingPageGenerator {
  // Generate a complete landing page for a book
  async generateLandingPage(bookId: string): Promise<{ html: string; id: string }> {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any;

    if (!book) throw new Error(`Book not found: ${bookId}`);

    const response = await aiEngine.generate(
      `Create a complete, beautiful HTML landing page for this fiction book:
Title: ${book.title}
Author: ${book.author}
Genre: ${book.genre}
Description: ${book.description}
Amazon URL: ${book.amazon_url}
Cover Image: ${book.cover_image_url}
Price: ${book.price}

Requirements:
- Modern, responsive design using only inline CSS (no external dependencies)
- Hero section with book cover, title, tagline, and CTA button
- "About the Book" section with description
- "What Readers Are Saying" section (use placeholder testimonials)
- Author bio section
- Email signup form (action="#" for now)
- Buy Now CTA linking to Amazon
- Footer with social media links
- Use a professional color scheme appropriate for ${book.genre} fiction
- Mobile-friendly
- Fast-loading (no external scripts)
- Include Open Graph meta tags
- Include a favicon placeholder

Return ONLY the complete HTML document, nothing else.`,
      'You are a web designer specializing in book marketing landing pages that convert.'
    );

    const id = generateId();

    db.prepare(`
      INSERT INTO content (id, book_id, type, title, body, platform, status, metadata)
      VALUES (?, ?, 'landing_page', ?, ?, 'web', 'draft', ?)
    `).run(
      id,
      bookId,
      `Landing Page - ${book.title}`,
      response.content,
      JSON.stringify({
        slug: slugify(book.title || 'book-landing'),
        generatedAt: new Date().toISOString(),
      })
    );

    logActivity('landing_page_generated', 'content', id, { bookTitle: book.title });
    logger.info('Landing page generated', { id, bookId });

    return { html: response.content, id };
  }

  // Generate an author website page
  async generateAuthorPage(authorName: string, bookIds: string[]): Promise<{ html: string; id: string }> {
    const db = getDb();
    const books = bookIds.map((id) => db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any).filter(Boolean);

    const bookList = books
      .map((b: any) => `- ${b.title} (${b.genre}) - ${b.amazon_url}`)
      .join('\n');

    const response = await aiEngine.generate(
      `Create a complete HTML author website page:
Author: ${authorName}
Books:
${bookList}

Requirements:
- Clean, elegant design with inline CSS
- Author hero section
- Book showcase grid with covers and buy links
- Newsletter signup section
- Contact/social media section
- Responsive design
- Professional typography

Return ONLY the complete HTML document.`,
      'You are a web designer specializing in author brand websites.'
    );

    const id = generateId();

    db.prepare(`
      INSERT INTO content (id, book_id, type, title, body, platform, status, metadata)
      VALUES (?, ?, 'author_page', 'Author Website', ?, 'web', 'draft', ?)
    `).run(
      id,
      books[0]?.id || '',
      response.content,
      JSON.stringify({ authorName, generatedAt: new Date().toISOString() })
    );

    return { html: response.content, id };
  }

  // Get all landing pages
  getLandingPages(bookId?: string): any[] {
    const db = getDb();
    let query = "SELECT * FROM content WHERE type IN ('landing_page', 'author_page')";
    const params: any[] = [];

    if (bookId) {
      query += ' AND book_id = ?';
      params.push(bookId);
    }

    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(...params);
  }
}

export const landingPageGenerator = new LandingPageGenerator();
