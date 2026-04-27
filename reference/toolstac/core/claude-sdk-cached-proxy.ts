/**
 * Cached Claude Code Proxy Client
 *
 * Wraps the Claude Code proxy with AI cache to avoid repeated expensive calls
 */

import { log } from '@/lib/logger';
import { AIRedisCache } from './ai-cache-redis';
import {
  aiProxy as claudeSDKProxy,
  ClaudeProxyResponse,
  ClaudePromptOptions,
  ClaudeCodeProxyClient,
} from './ai-proxy';

export interface CachedClaudePromptOptions extends ClaudePromptOptions {
  skipCache?: boolean;
  cacheTTL?: number;
}

interface CachedClaudeResponse {
  content: string;
  zipData?: string;
  zipFilename?: string;
  zipError?: string;
  stderr?: string;
  exitCode?: number;
}

export class CachedClaudeCodeProxyClient {
  private proxyClient: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  constructor(host?: string, port?: string) {
    // Create a specific proxy client instance if host/port provided
    if (host || port) {
      this.proxyClient = new ClaudeCodeProxyClient(host, port);
    } else {
      // Use the default exported instance
      this.proxyClient = claudeSDKProxy;
    }
  }

  /**
   * Execute a Claude Code prompt with caching
   */
  async prompt(
    prompt: string,
    options: CachedClaudePromptOptions = {}
  ): Promise<ClaudeProxyResponse> {
    const { skipCache = false, cacheTTL, ...claudeOptions } = options as CachedClaudePromptOptions;

    // Skip cache only if explicitly requested
    if (skipCache) {
      log.info('⚡ [CachedClaudeProxy] Skipping cache for prompt (explicit request)');
      return await this.proxyClient.prompt(prompt, { ...claudeOptions, skipCache: true });
    }

    // Create cache-friendly message format - just use the prompt
    const cacheParams = { messages: [{ role: 'user', content: prompt }] };

    try {
      // Check cache first
      const cached = await AIRedisCache.get(cacheParams);
      if (cached) {
        // Type assertion for cached Claude Code response data
        const cachedData = cached as CachedClaudeResponse;
        const hasZipData = cachedData.zipData ? ' with zip data' : '';
        log.info(
          `💾 [CachedClaudeProxy] Cache hit for prompt (${prompt.length} chars)${hasZipData}`
        );

        // Reconstruct full Claude Code response from cache
        const cachedResponse: ClaudeProxyResponse = {
          success: true,
          output: cachedData.content || '',
          timestamp: new Date().toISOString(),
          // Restore all cached fields
          zipData: cachedData.zipData,
          zipFilename: cachedData.zipFilename,
          zipError: cachedData.zipError,
          stderr: cachedData.stderr,
          exitCode: cachedData.exitCode,
        };

        return cachedResponse;
      }

      // Cache miss - make the actual request
      log.info('💫 [CachedClaudeProxy] Cache miss, making Claude Code proxy request');
      const response = await this.proxyClient.prompt(prompt, claudeOptions);

      // Cache successful responses (including zip data)
      if (response.success && (response.output || response.zipData)) {
        const cacheContent = {
          content: response.output || '',
          // Include all Claude Code response fields for complete caching
          zipData: response.zipData,
          zipFilename: response.zipFilename,
          zipError: response.zipError,
          stderr: response.stderr,
          exitCode: response.exitCode,
        };

        await AIRedisCache.set(
          cacheParams,
          cacheContent,
          cacheTTL || 24 * 60 * 60 // Default 1 day for all data
        );

        const cacheSize = JSON.stringify(cacheContent).length;
        log.info(
          `💾 [CachedClaudeProxy] Cached successful response (${cacheSize} bytes)${response.zipData ? ' with zip data' : ''}`
        );
      }

      return response;
    } catch (error) {
      log.error('❌ [CachedClaudeProxy] Error:', error);
      // Fallback to direct proxy call on cache error
      return await this.proxyClient.prompt(prompt, claudeOptions);
    }
  }

  /**
   * Execute Claude Code command (no caching for commands)
   */
  async execute(
    args: string[],
    options: { cwd?: string; input?: string } = {}
  ): Promise<ClaudeProxyResponse> {
    // Commands are not cached as they may have side effects
    return await this.proxyClient.execute(args, options);
  }

  /**
   * Check proxy health
   */
  async checkHealth(): Promise<boolean> {
    return await this.proxyClient.checkHealth();
  }

  /**
   * Check authentication
   */
  async checkAuth(): Promise<boolean> {
    return await this.proxyClient.checkAuth();
  }

  /**
   * Get files (no caching)
   */
  async getFiles(path: string = '.'): Promise<Array<{ name: string; type: string; path: string }>> {
    return await this.proxyClient.getFiles(path);
  }

  /**
   * Save zip file (no caching)
   */
  async saveZipFile(zipData: string, filename: string, outputDir: string = '.'): Promise<string> {
    return await this.proxyClient.saveZipFile(zipData, filename, outputDir);
  }

  /**
   * Clear cache for specific prompts (useful for debugging)
   */
  async clearCache(prompt: string): Promise<boolean> {
    const cacheParams = { messages: [{ role: 'user', content: prompt }] };

    try {
      const key = AIRedisCache.generateCacheKey(cacheParams);
      const result = await AIRedisCache.delete(key);
      log.info('🧹 [CachedClaudeProxy] Cleared cache for specific prompt');
      return result > 0;
    } catch (error) {
      log.error('❌ [CachedClaudeProxy] Error clearing cache:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalEntries: number;
    estimatedSize: string;
    oldestEntry?: Date;
    newestEntry?: Date;
  }> {
    return await AIRedisCache.getStats();
  }
}

// Export singleton instance
export const cachedClaudeSDKProxy = new CachedClaudeCodeProxyClient();
