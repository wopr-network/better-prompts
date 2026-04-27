/**
 * Prompt Evolution Service
 *
 * Orchestrates the evolution of humanizer prompts by analyzing failures
 * and generating improved versions that get stored back in the prompt store.
 */

import { log } from '@/lib/logger';
import { PromptEnhancerAgent } from '@/lib/prompt-enhancer-agent';
import { PromptStore } from '@/lib/prompt-store';
import type { Prompt } from '@/types/prompt';

export class PromptEvolutionService {
  private enhancerAgent: PromptEnhancerAgent;

  constructor() {
    this.enhancerAgent = new PromptEnhancerAgent();
    log.info('🧬 Prompt Evolution Service initialized');
  }

  /**
   * Evolve a specific prompt category based on failed content
   */
  async evolvePrompt(
    promptType: string,
    failedContent: string,
    _description?: string
  ): Promise<{
    newPrompt: Prompt;
    analysis: string;
    evolutionStep: number;
  }> {
    log.info(`🧬 Starting ${promptType} prompt evolution...`);

    // Get the current active prompt
    const currentPrompt = await PromptStore.getLatestPrompt(promptType, 0);
    if (!currentPrompt) {
      throw new Error(`No current ${promptType} prompt found in store`);
    }

    // Use the enhancer agent to create an improved version
    // For evolution service, we treat failedContent as the output that needs improvement
    const contextValues = {
      content: failedContent,
      reportDir: '${reportDir}',
      reportFile: '${reportFile}',
    };

    const result = await this.enhancerAgent.enhancePrompt(
      currentPrompt.prompt,
      contextValues,
      failedContent, // The failed content is both context and output for evolution
      currentPrompt.tokens
    );

    if (!result.enhancedPrompt) {
      throw new Error('Enhancer agent failed to generate improved prompt');
    }

    // Create a new version number (increment from current)
    const newVersion = currentPrompt.version + 0.1;

    // Store the enhanced prompt as the new version
    const newPrompt = await PromptStore.addPrompt(
      promptType,
      result.enhancedPrompt,
      newVersion,
      currentPrompt.tokens // Preserve the same tokens
    );

    log.info(`🎉 Evolved ${promptType} prompt from v${currentPrompt.version} to v${newVersion}`);

    return {
      newPrompt,
      analysis: result.analysis,
      evolutionStep: Math.floor((newVersion - Math.floor(currentPrompt.version)) * 10),
    };
  }

  /**
   * Legacy method for backward compatibility - evolve humanizer prompt
   */
  async evolveHumanizerPrompt(
    failedContent: string,
    description?: string
  ): Promise<{
    newPrompt: Prompt;
    analysis: string;
    evolutionStep: number;
  }> {
    return this.evolvePrompt('humanizer', failedContent, description);
  }

  /**
   * Get the evolution history (last N versions) for a specific prompt type
   */
  async getEvolutionHistory(
    promptType: string = 'humanizer',
    limit: number = 10
  ): Promise<Prompt[]> {
    return PromptStore.getPromptHistory(promptType, limit);
  }

  /**
   * Compare two versions of a prompt
   */
  async comparePrompts(
    promptType: string,
    olderIndex: number = 1,
    newerIndex: number = 0
  ): Promise<{
    older: Prompt | null;
    newer: Prompt | null;
    lengthDiff: number;
    versionDiff: number;
    timeDiff: string;
  }> {
    const [newer, older] = await Promise.all([
      PromptStore.getLatestPrompt(promptType, newerIndex),
      PromptStore.getLatestPrompt(promptType, olderIndex),
    ]);

    const lengthDiff = (newer?.prompt.length || 0) - (older?.prompt.length || 0);
    const versionDiff = (newer?.version || 0) - (older?.version || 0);

    let timeDiff = 'N/A';
    if (newer && older) {
      const timeDiffMs = new Date(newer.createdAt).getTime() - new Date(older.createdAt).getTime();
      timeDiff = `${Math.round(timeDiffMs / (1000 * 60))} minutes`;
    }

    return {
      older,
      newer,
      lengthDiff,
      versionDiff,
      timeDiff,
    };
  }

  /**
   * Rollback to a previous version (make it the latest)
   */
  async rollbackToVersion(promptType: string, targetIndex: number): Promise<Prompt> {
    const targetPrompt = await PromptStore.getLatestPrompt(promptType, targetIndex);
    if (!targetPrompt) {
      throw new Error(`No prompt found at index ${targetIndex} for type ${promptType}`);
    }

    // Create a new version with the same content but newer timestamp
    const currentLatest = await PromptStore.getLatestPrompt(promptType, 0);
    const newVersion = (currentLatest?.version || 0) + 0.1;

    const rolledBackPrompt = await PromptStore.addPrompt(
      promptType,
      targetPrompt.prompt,
      newVersion,
      targetPrompt.tokens
    );

    log.info(
      `🔄 Rolled back ${promptType} to prompt v${targetPrompt.version} as new v${newVersion}`
    );
    return rolledBackPrompt;
  }
}
