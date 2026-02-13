import { getDb, logActivity } from '../../database';
import { generateId, slugify } from '../../utils/helpers';
import { aiEngine } from '../../core/ai-engine';
import logger from '../../utils/logger';

export interface BlogPost {
  id: string;
  bookId: string;
  title: string;
  slug: string;
  content: string;
  metaDescription: string;
  tags: string[];
  status: 'draft' | 'published' | 'scheduled';
  publishedAt: string | null;
}

export class BlogGenerator {
  // Generate a blog post targeting a specific keyword
  async generatePost(
    bookId: string,
    keyword: string,
    wordCount: number = 1500
  ): Promise<BlogPost> {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any;

    if (!book) throw new Error(`Book not found: ${bookId}`);

    const generated = await aiEngine.generateBlogPost(
      book.title,
      book.description,
      keyword,
      wordCount
    );

    const id = generateId();
    const slug = slugify(generated.title);

    db.prepare(`
      INSERT INTO content (id, book_id, type, title, body, platform, status, metadata)
      VALUES (?, ?, 'blog_post', ?, ?, 'blog', 'draft', ?)
    `).run(
      id,
      bookId,
      generated.title,
      generated.content,
      JSON.stringify({
        slug,
        metaDescription: generated.metaDescription,
        tags: generated.tags,
        keyword,
        wordCount,
      })
    );

    logActivity('blog_post_generated', 'content', id, { keyword, title: generated.title });
    logger.info('Blog post generated', { id, keyword });

    return {
      id,
      bookId,
      title: generated.title,
      slug,
      content: generated.content,
      metaDescription: generated.metaDescription,
      tags: generated.tags,
      status: 'draft',
      publishedAt: null,
    };
  }

  // Generate a series of related blog posts
  async generateSeries(
    bookId: string,
    keywords: string[],
    wordCount: number = 1500
  ): Promise<BlogPost[]> {
    const posts: BlogPost[] = [];

    for (const keyword of keywords) {
      try {
        const post = await this.generatePost(bookId, keyword, wordCount);
        posts.push(post);
      } catch (error: any) {
        logger.error('Failed to generate blog post', { keyword, error: error.message });
      }
    }

    return posts;
  }

  // Generate guest post pitches for book bloggers
  async generateGuestPostPitch(bookId: string, blogName: string): Promise<string> {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any;

    if (!book) throw new Error(`Book not found: ${bookId}`);

    const response = await aiEngine.generate(
      `Write a compelling guest post pitch email to ${blogName} for this fiction book:
Title: ${book.title}
Author: ${book.author}
Genre: ${book.genre}
Description: ${book.description}

The pitch should:
- Be personal and show you've read their blog
- Propose 3 specific article ideas
- Highlight what value it brings to their readers
- Be concise (under 300 words)
- Include a professional sign-off

Return ONLY the email body text.`,
      'You are a book PR specialist who excels at getting media coverage for authors.'
    );

    return response.content;
  }

  // Generate book review request template
  async generateReviewRequest(bookId: string): Promise<string> {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any;

    if (!book) throw new Error(`Book not found: ${bookId}`);

    const response = await aiEngine.generate(
      `Write an ARC (Advance Review Copy) request email for this fiction book:
Title: ${book.title}
Author: ${book.author}
Genre: ${book.genre}
Description: ${book.description}
Amazon URL: ${book.amazon_url}

The email should:
- Be warm and respectful of the reviewer's time
- Include a brief, enticing book description
- Clearly state what you're asking for (an honest review)
- Mention where to post the review (Amazon, Goodreads)
- Be professional but not stuffy

Return ONLY the email text.`,
      'You are a book marketing specialist focused on building authentic reader relationships.'
    );

    return response.content;
  }

  // Get all blog posts
  getPosts(bookId?: string, status?: string): any[] {
    const db = getDb();
    let query = "SELECT * FROM content WHERE type = 'blog_post'";
    const params: any[] = [];

    if (bookId) {
      query += ' AND book_id = ?';
      params.push(bookId);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(...params);
  }
}

export const blogGenerator = new BlogGenerator();
