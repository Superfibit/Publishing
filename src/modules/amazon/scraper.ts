import axios from 'axios';
import * as cheerio from 'cheerio';
import { getDb, logActivity } from '../../database';
import { generateId } from '../../utils/helpers';
import logger from '../../utils/logger';
import { BookConfig } from '../../config/books';

export class AmazonScraper {
  private userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // Fetch and parse an Amazon product page
  async scrapeBook(asin: string): Promise<Partial<BookConfig> & { reviews?: any }> {
    try {
      const url = `https://www.amazon.com/dp/${asin}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);

      const title = $('#productTitle').text().trim() ||
        $('span#ebooksProductTitle').text().trim() || '';

      const author = $('.author .a-link-normal').first().text().trim() ||
        $('.contributorNameID').first().text().trim() || '';

      const description = $('#bookDescription_feature_div .a-expander-content').text().trim() ||
        $('#bookDescription_feature_div span').text().trim() || '';

      const price = $('.kindle-price .a-color-price').text().trim() ||
        $('span.a-color-price').first().text().trim() || '';

      const coverImageUrl = $('#imgBlkFront').attr('src') ||
        $('#ebooksImgBlkFront').attr('src') || '';

      const rating = $('span.a-icon-alt').first().text().trim() || '';
      const reviewCount = $('#acrCustomerReviewText').text().trim() || '';

      // Extract categories
      const categories: string[] = [];
      $('#wayfinding-breadcrumbs_feature_div .a-link-normal').each((_, el) => {
        categories.push($(el).text().trim());
      });

      // Extract best seller rank
      const bsrText = $('li:contains("Best Sellers Rank")').text() ||
        $('td:contains("Best Sellers Rank")').next().text() || '';

      const bookData: Partial<BookConfig> & { reviews?: any } = {
        asin,
        title,
        author,
        description,
        price,
        coverImageUrl,
        amazonUrl: url,
        reviews: {
          rating,
          reviewCount,
          bsrText,
          categories,
        },
      };

      // Save to database
      this.saveBookData(bookData);

      logActivity('book_scraped', 'book', asin, { title, author });
      logger.info('Book data scraped', { asin, title });

      return bookData;
    } catch (error: any) {
      logger.error('Failed to scrape Amazon book', { asin, error: error.message });
      throw new Error(`Failed to scrape book ${asin}: ${error.message}`);
    }
  }

  // Save or update book data in the database
  private saveBookData(data: Partial<BookConfig> & { reviews?: any }): void {
    const db = getDb();

    const existing = db.prepare('SELECT id FROM books WHERE asin = ?').get(data.asin) as any;

    if (existing) {
      db.prepare(`
        UPDATE books SET
          title = COALESCE(NULLIF(?, ''), title),
          author = COALESCE(NULLIF(?, ''), author),
          description = COALESCE(NULLIF(?, ''), description),
          price = COALESCE(NULLIF(?, ''), price),
          cover_image_url = COALESCE(NULLIF(?, ''), cover_image_url),
          amazon_url = COALESCE(NULLIF(?, ''), amazon_url),
          metadata = ?,
          updated_at = datetime('now')
        WHERE asin = ?
      `).run(
        data.title || '',
        data.author || '',
        data.description || '',
        data.price || '',
        data.coverImageUrl || '',
        data.amazonUrl || '',
        JSON.stringify(data.reviews || {}),
        data.asin
      );
    } else {
      db.prepare(`
        INSERT INTO books (id, asin, title, author, description, genre, price, cover_image_url, amazon_url, metadata)
        VALUES (?, ?, ?, ?, ?, 'Fiction', ?, ?, ?, ?)
      `).run(
        generateId(),
        data.asin,
        data.title || '',
        data.author || '',
        data.description || '',
        data.price || '',
        data.coverImageUrl || '',
        data.amazonUrl || '',
        JSON.stringify(data.reviews || {})
      );
    }
  }

  // Scrape all configured books
  async scrapeAllBooks(asins: string[]): Promise<Map<string, Partial<BookConfig>>> {
    const results = new Map<string, Partial<BookConfig>>();

    for (const asin of asins) {
      try {
        const data = await this.scrapeBook(asin);
        results.set(asin, data);
        // Rate limit to avoid being blocked
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error: any) {
        logger.error('Failed to scrape book', { asin, error: error.message });
      }
    }

    return results;
  }

  // Get stored book data from database
  getStoredBook(asin: string): any {
    const db = getDb();
    return db.prepare('SELECT * FROM books WHERE asin = ?').get(asin);
  }

  // Get all stored books
  getAllStoredBooks(): any[] {
    const db = getDb();
    return db.prepare('SELECT * FROM books ORDER BY created_at DESC').all();
  }

  // Scrape competitor books in the same category
  async scrapeCategory(categoryUrl: string): Promise<any[]> {
    try {
      const response = await axios.get(categoryUrl, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);
      const competitors: any[] = [];

      $('.s-result-item[data-asin]').each((_, el) => {
        const asin = $(el).attr('data-asin');
        const title = $(el).find('h2 a span').text().trim();
        const price = $(el).find('.a-price .a-offscreen').first().text().trim();
        const rating = $(el).find('.a-icon-alt').text().trim();

        if (asin && title) {
          competitors.push({ asin, title, price, rating });
        }
      });

      logger.info(`Scraped ${competitors.length} competitors from category`);
      return competitors;
    } catch (error: any) {
      logger.error('Failed to scrape category', { error: error.message });
      return [];
    }
  }
}

export const amazonScraper = new AmazonScraper();
