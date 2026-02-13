import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  env: process.env.NODE_ENV || 'development',

  ai: {
    anthropicKey: process.env.ANTHROPIC_API_KEY || '',
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 4096,
  },

  amazon: {
    associateTag: process.env.AMAZON_ASSOCIATE_TAG || '',
    accessKey: process.env.AMAZON_ACCESS_KEY || '',
    secretKey: process.env.AMAZON_SECRET_KEY || '',
    partnerTag: process.env.AMAZON_PARTNER_TAG || '',
  },

  twitter: {
    apiKey: process.env.TWITTER_API_KEY || '',
    apiSecret: process.env.TWITTER_API_SECRET || '',
    accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
    accessSecret: process.env.TWITTER_ACCESS_SECRET || '',
  },

  facebook: {
    appId: process.env.FACEBOOK_APP_ID || '',
    appSecret: process.env.FACEBOOK_APP_SECRET || '',
    pageToken: process.env.FACEBOOK_PAGE_TOKEN || '',
    instagramBusinessId: process.env.INSTAGRAM_BUSINESS_ID || '',
  },

  tiktok: {
    clientKey: process.env.TIKTOK_CLIENT_KEY || '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
  },

  email: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || '',
    fromName: process.env.EMAIL_FROM_NAME || 'AI Book Publisher',
  },

  google: {
    apiKey: process.env.GOOGLE_API_KEY || '',
    searchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID || '',
  },

  approval: {
    email: process.env.APPROVAL_EMAIL || '',
    threshold: parseFloat(process.env.REQUIRE_APPROVAL_THRESHOLD || '0'),
  },

  db: {
    path: path.resolve(__dirname, '../../data/publisher.db'),
  },
};
