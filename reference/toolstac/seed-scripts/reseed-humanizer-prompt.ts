#!/usr/bin/env tsx

/**
 * Reseed Original Humanizer Prompt from Git
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { PromptStore } from './src/lib/prompt-store';

const execAsync = promisify(exec);

async function reseedOriginalPrompt() {
  console.log('🔄 Reseeding original humanizer prompt from git...\n');

  try {
    // Get the complete original file from git
    console.log('1️⃣ Getting original content-humanizer-agent.ts from git...');
    const { stdout } = await execAsync('git show HEAD~5:src/lib/content-humanizer-agent.ts');
    
    console.log(`✅ Retrieved file (${stdout.length} chars total)`);

    // Extract the HUMANIZER_PROMPT constant
    console.log('2️⃣ Extracting HUMANIZER_PROMPT...');
    
    const promptMatch = stdout.match(/export const HUMANIZER_PROMPT = `([\s\S]*?)`;/);
    if (!promptMatch) {
      throw new Error('Could not find HUMANIZER_PROMPT in the original file');
    }

    const originalPrompt = promptMatch[1];
    console.log(`✅ Extracted prompt (${originalPrompt.length} chars)`);

    // Extract tokens
    console.log('3️⃣ Extracting tokens...');
    const tokensMatch = stdout.match(/export const HUMANIZER_TOKENS.*?=\s*(\[[\s\S]*?\]);/);
    let tokens = [];
    
    if (tokensMatch) {
      try {
        // Clean up the tokens string and parse it safely
        const tokensStr = tokensMatch[1]
          .replace(/\/\/.*$/gm, '') // Remove comments
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();
        // Use JSON.parse instead of eval for safety
        tokens = JSON.parse(tokensStr);
        console.log(`✅ Extracted ${tokens.length} tokens`);
      } catch (e) {
        console.log('⚠️ Could not parse tokens, using empty array');
        tokens = [];
      }
    } else {
      console.log('⚠️ No tokens found in original file');
    }

    // Clear existing prompts and seed the original
    console.log('4️⃣ Seeding original prompt in database...');
    
    const seededPrompt = await PromptStore.addPrompt(
      'humanizer',
      originalPrompt,
      1000, // Clean version number
      tokens
    );

    console.log(`✅ Seeded original prompt:`);
    console.log(`   ID: ${seededPrompt.id}`);
    console.log(`   Version: ${seededPrompt.version}`);
    console.log(`   Length: ${seededPrompt.prompt.length} chars`);
    console.log(`   Tokens: ${seededPrompt.tokens.length}`);

    console.log('\n🎉 Original humanizer prompt restored successfully!');

  } catch (error) {
    console.error('💥 Failed to reseed prompt:', error instanceof Error ? error.message : error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run the reseeder
reseedOriginalPrompt().catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});
