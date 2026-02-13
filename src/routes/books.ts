import { Router, Request, Response } from 'express';
import { getDb } from '../database';
import { amazonScraper } from '../modules/amazon/scraper';
import { amazonOptimizer } from '../modules/amazon/optimizer';
import { generateId } from '../utils/helpers';
import logger from '../utils/logger';

const router = Router();

// GET /api/books - List all books
router.get('/', (_req: Request, res: Response) => {
  try {
    const books = amazonScraper.getAllStoredBooks();
    res.json({ success: true, data: books });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/books/:id - Get a single book
router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ? OR asin = ?').get(req.params.id, req.params.id);
    if (!book) return res.status(404).json({ success: false, error: 'Book not found' });
    res.json({ success: true, data: book });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/books - Add a new book by ASIN
router.post('/', async (req: Request, res: Response) => {
  try {
    const { asin, title, author, genre, description } = req.body;

    if (!asin) return res.status(400).json({ success: false, error: 'ASIN is required' });

    // Check if book already exists
    const db = getDb();
    const existing = db.prepare('SELECT * FROM books WHERE asin = ?').get(asin);
    if (existing) {
      return res.json({ success: true, data: existing, message: 'Book already exists' });
    }

    // Try to scrape from Amazon
    try {
      const scraped = await amazonScraper.scrapeBook(asin);
      const book = amazonScraper.getStoredBook(asin);
      res.json({ success: true, data: book });
    } catch {
      // If scraping fails, create manually
      const id = generateId();
      db.prepare(`
        INSERT INTO books (id, asin, title, author, genre, description, amazon_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, asin, title || '', author || '', genre || 'Fiction', description || '', `https://www.amazon.com/dp/${asin}`);

      const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
      res.json({ success: true, data: book });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/books/:id - Update a book
router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { title, author, genre, sub_genre, description, keywords, price } = req.body;
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id) as any;

    if (!book) return res.status(404).json({ success: false, error: 'Book not found' });

    db.prepare(`
      UPDATE books SET
        title = COALESCE(?, title),
        author = COALESCE(?, author),
        genre = COALESCE(?, genre),
        sub_genre = COALESCE(?, sub_genre),
        description = COALESCE(?, description),
        keywords = COALESCE(?, keywords),
        price = COALESCE(?, price),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(title, author, genre, sub_genre, description, keywords ? JSON.stringify(keywords) : null, price, req.params.id);

    const updated = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/books/:id/scrape - Refresh book data from Amazon
router.post('/:id/scrape', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id) as any;

    if (!book) return res.status(404).json({ success: false, error: 'Book not found' });

    const scraped = await amazonScraper.scrapeBook(book.asin);
    const updated = amazonScraper.getStoredBook(book.asin);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/books/:id/optimize - Get listing optimization suggestions
router.post('/:id/optimize', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id) as any;

    if (!book) return res.status(404).json({ success: false, error: 'Book not found' });

    const optimization = await amazonOptimizer.optimizeListing(book.asin);
    res.json({ success: true, data: optimization });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
