// Enhanced prompt types supporting multiple categories and templates
export interface PromptToken {
  key: string; // e.g. "${reportDir}", "{{username}}"
  description: string;
  example?: string;
  required?: boolean;
}

export interface BasePrompt {
  id: string;
  category: PromptCategory; // humanizer, research, outreach, qa, etc.
  name: string; // descriptive name like "email-assessment-main"
  version: number;
  createdAt: string;
  updatedAt: string;
  tags: string[]; // ["email", "assessment", "agent"]

  // Source tracking
  sourceFile?: string; // where this was extracted from
  sourceMethod?: string; // method/function name
  sourceLineStart?: number;
  sourceLineEnd?: number;

  // Usage tracking
  usageCount?: number;
  lastUsed?: string;
  performanceScore?: number; // for A/B testing

  // Template support
  templateEngine: 'handlebars' | 'string-template' | 'raw';
  tokens: PromptToken[];
}

export interface StaticPrompt extends BasePrompt {
  templateEngine: 'raw' | 'string-template';
  content: string; // raw prompt text with ${token} placeholders
}

export interface HandlebarsPrompt extends BasePrompt {
  templateEngine: 'handlebars';
  templatePath?: string; // path to .hbs file
  content: string; // handlebars template source
}

export type UniversalPrompt = StaticPrompt | HandlebarsPrompt;

export enum PromptCategory {
  HUMANIZER = 'humanizer',
  RESEARCH = 'research',
  EMAIL_ASSESSMENT = 'email_assessment',
  OUTREACH = 'outreach',
  QA = 'qa',
  GAP_ANALYSIS = 'gap_analysis',
  TWITTER_STRATEGY = 'twitter_strategy',
  ENHANCEMENT = 'enhancement',
  REPLY_SUGGESTION = 'reply_suggestion',
  THREAD_SUMMARY = 'thread_summary',
  GENERIC_CLAUDE = 'generic_claude',
  OTHER = 'other',
}
