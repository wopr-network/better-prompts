import { createDB } from './src/lib/db/index.js';

const db = createDB();
const result = db
  .prepare('SELECT name, prompt FROM ai_prompts WHERE name = ?')
  .get('ai-slop-detector');

if (result) {
  console.log('✅ Found ai-slop-detector prompt');
  console.log('Prompt length:', result.prompt.length);

  // Check for Handlebars syntax issues
  const prompt = result.prompt;
  const ifCount = (prompt.match(/{{#if/g) || []).length;
  const unlessCount = (prompt.match(/{{#unless/g) || []).length;
  const endifCount = (prompt.match(/{{\/if}}/g) || []).length;
  const endunlessCount = (prompt.match(/{{\/unless}}/g) || []).length;

  console.log('Conditional blocks:');
  console.log('  {{#if}}:', ifCount, '{{/if}}:', endifCount);
  console.log('  {{#unless}}:', unlessCount, '{{/unless}}:', endunlessCount);

  if (ifCount !== endifCount || unlessCount !== endunlessCount) {
    console.log('❌ Mismatched conditional blocks detected!');
  }

  // Show first few lines around line 30 where the error occurred
  const lines = prompt.split('\n');
  if (lines.length >= 30) {
    console.log('\nLines 25-35:');
    for (let i = 24; i < Math.min(35, lines.length); i++) {
      console.log(`${i + 1}: ${lines[i]}`);
    }
  }
} else {
  console.log('❌ ai-slop-detector prompt not found in database');
}
