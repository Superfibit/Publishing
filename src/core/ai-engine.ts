import axios from 'axios';
import { config } from '../config';
import logger from '../utils/logger';

interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AIResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
}

export class AIEngine {
  private apiKey: string;
  private model: string;
  private maxTokens: number;

  constructor() {
    this.apiKey = config.ai.anthropicKey;
    this.model = config.ai.model;
    this.maxTokens = config.ai.maxTokens;
  }

  async generate(prompt: string, systemPrompt?: string): Promise<AIResponse> {
    try {
      const messages: AIMessage[] = [{ role: 'user', content: prompt }];

      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: this.model,
          max_tokens: this.maxTokens,
          system: systemPrompt || this.getDefaultSystemPrompt(),
          messages,
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );

      const result = response.data;
      return {
        content: result.content[0].text,
        usage: {
          inputTokens: result.usage.input_tokens,
          outputTokens: result.usage.output_tokens,
        },
      };
    } catch (error: any) {
      logger.error('AI generation failed', { error: error.message });
      throw new Error(`AI generation failed: ${error.message}`);
    }
  }

  private getDefaultSystemPrompt(): string {
    return `You are an expert book marketing strategist and copywriter. You help fiction authors
promote their books on Amazon and drive sales through compelling content creation.
You understand Amazon's algorithm, SEO best practices, social media marketing,
email marketing, and content marketing for books. Always write engaging,
conversion-focused copy that maintains the author's voice and brand.`;
  }

  // Generate social media post for a specific platform
  async generateSocialPost(
    bookTitle: string,
    bookDescription: string,
    platform: 'twitter' | 'instagram' | 'facebook' | 'tiktok',
    tone: string = 'engaging'
  ): Promise<string> {
    const platformLimits: Record<string, number> = {
      twitter: 280,
      instagram: 2200,
      facebook: 5000,
      tiktok: 2200,
    };

    const prompt = `Create a ${tone} ${platform} post promoting this fiction book:
Title: ${bookTitle}
Description: ${bookDescription}

Requirements:
- Character limit: ${platformLimits[platform]} characters
- Include a compelling hook
- Include a call-to-action to check it out on Amazon
- Include 3-5 relevant hashtags for ${platform}
- Make it feel authentic, not spammy
- For ${platform === 'tiktok' ? 'TikTok: suggest a video concept/script idea' : platform + ': optimize for the platform\'s algorithm'}

Return ONLY the post text, nothing else.`;

    const response = await this.generate(prompt);
    return response.content;
  }

  // Generate blog post for SEO
  async generateBlogPost(
    bookTitle: string,
    bookDescription: string,
    keyword: string,
    wordCount: number = 1500
  ): Promise<{ title: string; content: string; metaDescription: string; tags: string[] }> {
    const prompt = `Write an SEO-optimized blog post that naturally promotes this fiction book:
Title: ${bookTitle}
Description: ${bookDescription}
Target Keyword: ${keyword}
Word Count: ~${wordCount} words

Requirements:
- The blog post should provide genuine value (reading tips, genre discussion, thematic exploration)
- Naturally weave in the book recommendation
- Include the target keyword in the title, first paragraph, and 2-3 times throughout
- Use H2 and H3 headings
- Include a compelling meta description (150-160 characters)
- End with a call-to-action
- Suggest 5 tags

Return in this exact JSON format:
{
  "title": "Blog Post Title",
  "content": "Full blog post in markdown format",
  "metaDescription": "SEO meta description",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`;

    const response = await this.generate(prompt);
    try {
      return JSON.parse(response.content);
    } catch {
      // If AI doesn't return valid JSON, extract what we can
      return {
        title: `${keyword} - A Must-Read Guide`,
        content: response.content,
        metaDescription: `Discover ${bookTitle} - ${keyword}`,
        tags: [keyword],
      };
    }
  }

  // Generate email marketing copy
  async generateEmailCopy(
    bookTitle: string,
    bookDescription: string,
    emailType: 'welcome' | 'promotion' | 'newsletter' | 'launch' | 'review_request'
  ): Promise<{ subject: string; bodyHtml: string; bodyText: string }> {
    const prompt = `Write a ${emailType} email for promoting this fiction book:
Title: ${bookTitle}
Description: ${bookDescription}

Email Type: ${emailType}
${emailType === 'welcome' ? 'This is for new subscribers who signed up for updates about the book/author.' : ''}
${emailType === 'promotion' ? 'This is a promotional email highlighting a sale or special offer.' : ''}
${emailType === 'newsletter' ? 'This is a monthly newsletter update from the author.' : ''}
${emailType === 'launch' ? 'This is a book launch announcement email.' : ''}
${emailType === 'review_request' ? 'This is a follow-up asking readers to leave an Amazon review.' : ''}

Requirements:
- Compelling subject line (under 60 characters)
- Personal, warm tone
- Clear call-to-action with Amazon link placeholder: {{AMAZON_LINK}}
- Use {{FIRST_NAME}} for personalization
- Include unsubscribe link placeholder: {{UNSUBSCRIBE_LINK}}

Return in this exact JSON format:
{
  "subject": "Email Subject Line",
  "bodyHtml": "<html>Full HTML email body</html>",
  "bodyText": "Plain text version of the email"
}`;

    const response = await this.generate(prompt);
    try {
      return JSON.parse(response.content);
    } catch {
      return {
        subject: `Check out ${bookTitle}`,
        bodyHtml: `<p>${response.content}</p>`,
        bodyText: response.content,
      };
    }
  }

  // Generate Amazon listing optimization suggestions
  async generateListingOptimization(
    currentTitle: string,
    currentDescription: string,
    currentKeywords: string[],
    genre: string
  ): Promise<{
    titleSuggestions: string[];
    descriptionSuggestion: string;
    keywordSuggestions: string[];
    categoryRecommendations: string[];
    pricingInsights: string;
  }> {
    const prompt = `Analyze and optimize this Amazon book listing for maximum visibility and sales:

Current Title: ${currentTitle}
Current Description: ${currentDescription}
Current Keywords: ${currentKeywords.join(', ')}
Genre: ${genre}

Provide optimization recommendations in this JSON format:
{
  "titleSuggestions": ["3 optimized title variations"],
  "descriptionSuggestion": "Optimized book description with keyword-rich copy",
  "keywordSuggestions": ["15-20 high-impact backend keywords"],
  "categoryRecommendations": ["3-5 best Amazon categories to target"],
  "pricingInsights": "Pricing strategy recommendation"
}`;

    const response = await this.generate(prompt);
    try {
      return JSON.parse(response.content);
    } catch {
      return {
        titleSuggestions: [currentTitle],
        descriptionSuggestion: currentDescription,
        keywordSuggestions: currentKeywords,
        categoryRecommendations: [genre],
        pricingInsights: 'Unable to generate pricing insights',
      };
    }
  }

  // Generate keyword ideas for SEO
  async generateKeywords(
    bookTitle: string,
    genre: string,
    description: string
  ): Promise<{ primary: string[]; secondary: string[]; longtail: string[] }> {
    const prompt = `Generate SEO keywords for marketing this fiction book:
Title: ${bookTitle}
Genre: ${genre}
Description: ${description}

Return in this JSON format:
{
  "primary": ["5 high-volume primary keywords"],
  "secondary": ["10 medium-volume secondary keywords"],
  "longtail": ["15 long-tail keyword phrases for blog content"]
}`;

    const response = await this.generate(prompt);
    try {
      return JSON.parse(response.content);
    } catch {
      return {
        primary: [genre, bookTitle],
        secondary: [],
        longtail: [],
      };
    }
  }

  // Generate content calendar
  async generateContentCalendar(
    bookTitle: string,
    genre: string,
    weeks: number = 4
  ): Promise<any[]> {
    const prompt = `Create a ${weeks}-week content marketing calendar for this fiction book:
Title: ${bookTitle}
Genre: ${genre}

For each day, include:
- Platform (twitter, instagram, facebook, tiktok, blog, email)
- Content type (post, story, reel, thread, blog post, email)
- Topic/theme
- Brief content idea

Return as a JSON array:
[{
  "week": 1,
  "day": "Monday",
  "platform": "twitter",
  "contentType": "thread",
  "topic": "Topic here",
  "idea": "Brief content idea"
}]`;

    const response = await this.generate(prompt);
    try {
      return JSON.parse(response.content);
    } catch {
      return [];
    }
  }
}

export const aiEngine = new AIEngine();
