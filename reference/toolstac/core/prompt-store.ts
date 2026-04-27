import { randomUUID } from 'crypto';
import type { Prompt, PromptToken, PromptInvocation } from '@/types/prompt';
import { redis } from './redis-provider';

export class PromptStore {
  // Get existing prompt or store default if none exists
  // Optional codeDate allows code-based overrides: if provided and later than DB createdAt, prompt will be updated
  static async getOrStore(
    key: string,
    defaultPrompt: string,
    tokens?: PromptToken[],
    codeDate?: string | Date // ISO timestamp or Date object - if later than DB createdAt, forces update
  ): Promise<Prompt> {
    // Try to get existing prompt
    const existing = await this.getLatestPrompt(key, 0);

    if (existing) {
      // If no codeDate provided, just return existing
      if (!codeDate) {
        return existing;
      }

      // Compare dates to see if we should override
      const existingDate = new Date(existing.createdAt);
      const providedDate = new Date(codeDate);

      // Validate the provided date
      if (isNaN(providedDate.getTime())) {
        throw new Error(`Invalid codeDate provided: ${codeDate}`);
      }

      // If DB date is newer than or equal to our code date, ignore our input
      if (existingDate >= providedDate) {
        return existing;
      }

      // Our code date is newer than DB - override with our input
      const id = randomUUID();
      const v = Date.now();
      const normalizedCodeDate = providedDate.toISOString();

      const item: Prompt = {
        id,
        version: v,
        createdAt: normalizedCodeDate,
        prompt: defaultPrompt,
        tokens: tokens || [],
      };

      // Store the prompt data
      await redis.set(`prompt:${key}:${id}`, JSON.stringify(item));
      // Push to the list head so index 0 is latest
      await redis.lpush(`prompt:${key}:list`, id);

      return item;
    }

    // Nothing exists - create it
    return await this.addPrompt(key, defaultPrompt, Date.now(), tokens);
  }

  // Add a new prompt
  static async addPrompt(
    key: string,
    prompt: string,
    version?: number,
    tokens?: PromptToken[]
  ): Promise<Prompt> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const v = typeof version === 'number' ? version : Date.now();

    const item: Prompt = { id, version: v, createdAt, prompt, tokens: tokens || [] };

    // Store the prompt data
    await redis.set(`prompt:${key}:${id}`, JSON.stringify(item));
    // Push to the list head so index 0 is latest
    await redis.lpush(`prompt:${key}:list`, id);

    return item;
  }

  // Get latest prompt by list index (0 = newest)
  static async getLatestPrompt(key: string, index = 0): Promise<Prompt | null> {
    const id = await redis.lindex(`prompt:${key}:list`, index);
    if (!id) {
      return null;
    }

    const raw = await redis.get(`prompt:${key}:${id}`);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as Prompt;
    } catch {
      return null;
    }
  }

  // Get evolution history for any prompt type
  static async getPromptHistory(key: string, limit: number = 10): Promise<Prompt[]> {
    const history: Prompt[] = [];

    for (let i = 0; i < limit; i++) {
      const prompt = await this.getLatestPrompt(key, i);
      if (!prompt) {
        break;
      }
      history.push(prompt);
    }

    return history;
  }

  // Get all prompt keys (types)
  static async getAllPromptKeys(): Promise<string[]> {
    const keys = await redis.keys('prompt:*:list');
    return keys.map(key => key.split(':')[1]).filter(Boolean);
  }

  // Get all prompts (latest version of each category)
  static async getAllPrompts(): Promise<Prompt[]> {
    const keys = await this.getAllPromptKeys();
    const prompts: Prompt[] = [];

    for (const key of keys) {
      const prompt = await this.getLatestPrompt(key, 0);
      if (prompt) {
        prompts.push(prompt);
      }
    }

    return prompts;
  }

  // Track prompt usage
  static async logInvocation(
    key: string,
    templateVars: Record<string, string>,
    output: string
  ): Promise<void> {
    const invocation = {
      key,
      templateVars,
      output,
      date: new Date().toISOString(),
    };

    const listKey = `prompt:${key}:invocations`;
    await redis.lpush(listKey, JSON.stringify(invocation));
    // Keep only the last 25 entries
    await redis.ltrim(listKey, 0, 24);
  }

  // Get recent invocations for a prompt
  static async getInvocations(key: string, limit: number = 50): Promise<PromptInvocation[]> {
    const invocations = await redis.lrange(`prompt:${key}:invocations`, 0, limit - 1);
    return invocations.map(inv => JSON.parse(inv));
  }
}
