export interface BookConfig {
  asin: string;
  title: string;
  author: string;
  genre: string;
  subGenre: string;
  description: string;
  keywords: string[];
  amazonUrl: string;
  coverImageUrl: string;
  price: string;
  publicationDate: string;
  series?: string;
  seriesPosition?: number;
}

// Pre-configured books - these will also be stored in the database
export const DEFAULT_BOOKS: Partial<BookConfig>[] = [
  {
    asin: 'B0F63Z1XBN',
    genre: 'Fiction',
    amazonUrl: 'https://www.amazon.com/dp/B0F63Z1XBN',
  },
  {
    asin: 'B0GMWVMD66',
    genre: 'Fiction',
    amazonUrl: 'https://www.amazon.com/dp/B0GMWVMD66',
  },
  {
    asin: 'B0GMW3J8YZ',
    genre: 'Fiction',
    amazonUrl: 'https://www.amazon.com/dp/B0GMW3J8YZ',
  },
];
