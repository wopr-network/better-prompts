import { execSync } from 'child_process';
import fs from 'fs';
import { PromptStore } from '../src/lib/prompt-store';
import { redis } from '../src/lib/redis-provider';

async function getLastNightPrompt(): Promise<string> {
  // Get the prompt from last night's git commit
  execSync('git show 73417eb:src/lib/content-humanizer-agent.ts > /tmp/humanizer-last-night.ts');
  const fileContent = fs.readFileSync('/tmp/humanizer-last-night.ts', 'utf-8');
  
  // Extract the createHumanizationPrompt method
  const startMarker = 'public createHumanizationPrompt(content: string, reportDir: string, reportFile: string): string {';
  const endMarker = '  }\n}';
  
  const startIndex = fileContent.indexOf(startMarker);
  const endIndex = fileContent.lastIndexOf(endMarker);
  
  if (startIndex === -1 || endIndex === -1) {
    throw new Error('Could not find createHumanizationPrompt method in file');
  }
  
  // Extract the return statement content
  const methodContent = fileContent.substring(startIndex, endIndex);
  const returnStart = methodContent.indexOf('return `');
  const returnEnd = methodContent.lastIndexOf('`;');
  
  if (returnStart === -1 || returnEnd === -1) {
    throw new Error('Could not find return statement in method');
  }
  
  // Get the template string content (after 'return `' and before '`;')
  const templateContent = methodContent.substring(returnStart + 8, returnEnd);
  
  // Replace the placeholders as they appear in the original
  return templateContent
    .replace(/\$\{reportDir\}/g, '${reportDir}')
    .replace(/\$\{reportFile\}/g, '${reportFile}')
    .replace(/\$\{content\}/g, '${content}');
}

async function main() {
  // Read the exact prompt from last night's git history
  const prompt = await getLastNightPrompt();
  const version = Date.now();
  const item = await PromptStore.addPrompt('humanizer', prompt, version, [
    { key: '${reportDir}', description: 'Directory name where the analysis files are written', example: 'humanization-analysis-2025-08-23T18-05-12Z' },
    { key: '${reportFile}', description: 'Target markdown filename for the generated report', example: 'humanization-report-2025-08-23-abc123.md' },
    { key: '${content}', description: 'Raw input content to analyze and humanize', example: 'In this comprehensive guide…' },
  ]);

  // Optionally trim list to keep only N versions
  try {
    const r = redis.getRedis();
    await r.ltrim('prompt:humanizer:list', 0, 49); // keep latest 50
  } catch {}

  console.log('Seeded humanizer prompt:', { id: item.id, version: item.version, createdAt: item.createdAt });
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
