import * as crypto from 'crypto';
import JSZip from 'jszip';
import { log } from '@/lib/logger';
import { PromptStore } from '@/lib/prompt-store';
import type { HumanizerToken } from '@/types/prompt';
/**
 * Takes a humanizer prompt that failed to catch AI patterns and the content it missed,
 * then generates an improved version of the prompt that would catch those patterns.
 */

import { cachedClaudeSDKProxy } from './claude-sdk-cached-proxy';
import { compileTemplate } from './template-engine';

export class PromptEnhancerAgent {
  constructor() {
    log.info('🔧➡️🤖 Prompt Enhancer Agent initialized');
  }

  /**
   * Main entry point: Analyze a prompt that produced unsatisfactory output and generate improved version
   */
  async enhancePrompt(
    existingPrompt: string,
    contextValues: Record<string, string>, // The actual values that were substituted into the prompt
    actualOutput: string, // What the prompt produced (that we're unhappy with)
    tokens: HumanizerToken[]
  ): Promise<{
    enhancedPrompt: string;
    analysis: string;
    zipData?: string;
    zipFilename?: string;
  }> {
    log.info('🔍 Prompt Enhancer Agent analyzing underperforming prompt...');

    if (!existingPrompt || existingPrompt.trim().length === 0) {
      throw new Error('Existing prompt cannot be empty');
    }

    if (!actualOutput || actualOutput.trim().length === 0) {
      throw new Error('Actual output cannot be empty');
    }

    // Generate unique output filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const hash = crypto.randomBytes(4).toString('hex');
    const enhancedFile = `enhanced-humanizer-prompt-${timestamp}-${hash}.txt`;
    const analysisFile = `enhancement-analysis-${timestamp}-${hash}.md`;

    // Create temporary directory for outputs
    const outputDir = `prompt-enhancement-${timestamp}`;

    // PRE-CREATE the directory and initial files to send to Claude
    const fs = await import('fs');
    const path = await import('path');

    // Create output directory
    await fs.promises.mkdir(outputDir, { recursive: true });

    // Write the existing prompt to the file Claude should edit
    await fs.promises.writeFile(path.join(outputDir, enhancedFile), existingPrompt, 'utf8');

    // Create initial analysis file with actual analysis of what the prompt produced vs expected
    const initialAnalysis = this.analyzePromptFailure(existingPrompt, contextValues, actualOutput);
    await fs.promises.writeFile(path.join(outputDir, analysisFile), initialAnalysis, 'utf8');

    log.info(`📁 Pre-created ${outputDir} with existing prompt for Claude to edit`);

    // Create ZIP of the directory to send to Claude
    const zip = new JSZip();
    const existingPromptContent = await fs.promises.readFile(
      path.join(outputDir, enhancedFile),
      'utf8'
    );
    const existingAnalysisContent = await fs.promises.readFile(
      path.join(outputDir, analysisFile),
      'utf8'
    );

    zip.folder(outputDir)?.file(enhancedFile, existingPromptContent);
    zip.folder(outputDir)?.file(analysisFile, existingAnalysisContent);

    const inputZipData = await zip.generateAsync({ type: 'base64' });

    // Create the prompt enhancement analysis prompt
    const enhancementPrompt = await this.createEnhancementPromptAsync(
      existingPrompt,
      contextValues,
      actualOutput,
      tokens,
      outputDir,
      enhancedFile,
      analysisFile
    );

    // Log the FULL enhancement prompt
    log.info('\n📜 FULL ENHANCEMENT PROMPT BEING SENT TO CLAUDE:');
    log.info('='.repeat(80));
    log.info(enhancementPrompt);
    log.info('='.repeat(80));
    log.info('');

    // Execute Claude Code to analyze and enhance the prompt
    const response = await cachedClaudeSDKProxy.prompt(enhancementPrompt, {
      timeout: 300000, // 5 minutes
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      verbose: true,
      returnZip: true, // Request zip file of the outputs
      zipDirectory: outputDir, // Only zip the output directory
      inputZipData: inputZipData, // Send the pre-created files for Claude to edit
    });

    // Clean up temp directory
    await fs.promises.rm(outputDir, { recursive: true, force: true });

    if (!response.success) {
      throw new Error(`Prompt enhancement failed: ${response.error}`);
    }

    log.info('✅ Prompt Enhancer Agent completed analysis');

    // Extract the enhanced prompt and analysis from the zip
    let enhancedPrompt = '';
    let analysis = '';

    if (response.zipData) {
      try {
        const zip = new JSZip();
        const zipContents = await zip.loadAsync(response.zipData, { base64: true });

        // Find the enhanced prompt file
        const promptFileName = Object.keys(zipContents.files).find(
          name => name.endsWith('.txt') && name.includes('enhanced-humanizer-prompt')
        );
        if (promptFileName) {
          enhancedPrompt = await zipContents.files[promptFileName].async('string');
          log.info(`📄 Extracted enhanced prompt from ${promptFileName}`);
        }

        // Find the analysis file
        const analysisFileName = Object.keys(zipContents.files).find(
          name => name.endsWith('.md') && name.includes('enhancement-analysis')
        );
        if (analysisFileName) {
          analysis = await zipContents.files[analysisFileName].async('string');
          log.info(`📄 Extracted analysis from ${analysisFileName}`);
        }

        if (!enhancedPrompt && !analysis) {
          log.warn('⚠️ No output files found in zip, using Claude output');
          enhancedPrompt = response.output || '';
        }
      } catch (error) {
        log.error('❌ Failed to extract outputs from zip:', error);
        enhancedPrompt = response.output || '';
      }
    } else {
      log.warn('⚠️ No zip data received, using Claude output');
      enhancedPrompt = response.output || '';
    }

    return {
      enhancedPrompt,
      analysis,
      zipData: response.zipData,
      zipFilename: response.zipFilename,
    };
  }

  /**
   * Create the prompt enhancement analysis prompt
   */
  private async createEnhancementPromptAsync(
    existingPrompt: string,
    contextValues: Record<string, string>,
    actualOutput: string,
    tokens: HumanizerToken[],
    outputDir: string,
    enhancedFile: string,
    analysisFile: string
  ): Promise<string> {
    const tokensDescription = tokens
      .map(t => `- ${t.key}: ${t.description}${t.example ? ` (example: "${t.example}")` : ''}`)
      .join('\n');

    const enhancementPrompt = await PromptStore.getOrStore(
      'prompt-enhancer.analysis',
      `You are the ULTIMATE PROMPT ENHANCEMENT ENGINE. You've been called in because a prompt produced output SO BAD that a human had to escalate to you - the prompt specialist.

## 🚨 THE SITUATION:

A prompt was given some context values, produced output, and that output was TERRIBLE. So terrible that we're now having this conversation. Your job is to figure out:
1. What the prompt was TRYING to do (its intent)
2. Why it failed so spectacularly 
3. How to make it actually work

## 🎯 PHASE 1: INTENT ANALYSIS (DO THIS FIRST!)

**STEP 1: READ THE PROMPT FROM DISK**
Read the file \`{{outputDir}}/{{enhancedFile}}\` to see the full prompt template that needs enhancement.

**STEP 2: DETECTIVE WORK**
After reading the prompt, become a detective:

**1. REVERSE ENGINEER THE INTENT**
Look at the prompt template and ask:
- What was this prompt SUPPOSED to achieve? (detection, generation, transformation, analysis, classification?)
- What domain is it operating in? (technical, creative, analytical, educational?)
- What would GOOD output have looked like? (infer from the prompt's instructions)
- What style/tone was it going for? (professional, casual, technical, angry engineer at 3am?)
- What constraints does it have? (tokens, format, length, specific requirements?)

**2. FAILURE FORENSICS**
Compare what it produced vs what it clearly wanted:
- How did the output fail? (wrong tone? missed the point? too generic? too specific?)
- Did it misunderstand the task or just execute poorly?
- Are there ambiguous instructions that could be misinterpreted?
- What assumptions did it make that were wrong?

**3. CONTEXT-OUTPUT MISMATCH ANALYSIS**
Look at the context values that were provided:
- Did the prompt handle these specific values well?
- Were there edge cases in the context it wasn't prepared for?
- Did the template variables get used effectively?
- What patterns in the context triggered bad behavior?

## 📊 THE EXISTING PROMPT TEMPLATE TO ANALYZE:

**READ IT FROM DISK:** The prompt template is in \`{{outputDir}}/{{enhancedFile}}\`
Start by reading that file to understand what prompt needs enhancement.

## 🔍 THE CONTEXT VALUES (What was substituted into the template):
\`\`\`json
{{contextValuesJson}}
\`\`\`

## 📝 THE ACTUAL OUTPUT (What the prompt produced that we're unhappy with):
\`\`\`
{{actualOutput}}
\`\`\`

## 🔧 PHASE 2: SURGICAL ENHANCEMENT

Based on your intent analysis, enhance the prompt using these UNIVERSAL IMPROVEMENT PRINCIPLES:

### 🎯 MASTER PROMPT ENGINEERING RULES (Keep These!):

**PATTERN DESIGN PRINCIPLES:**
- Make patterns BROAD, not specific to one example
- Use "sounds like X but actually Y" format for nuanced detection
- Give messy realistic examples, not clean textbook ones
- Focus on BEHAVIOR patterns, not keyword lists
- Explain WHY something matters (the psychology/logic behind it)
- Use ranges instead of exact matches ("3-7 items" not "exactly 5")
- Test rules against edge cases mentally before writing them
- Make detection/generation contextual (what's normal vs what's not)
- Prioritize subtle patterns over obvious ones
- Layer multiple weak signals into strong detection/generation

**COMBINATORIAL INTELLIGENCE:**
- Build rules that work together (if pattern A + pattern B + pattern C, then confidence = 90%)
- Create cascading logic (first catch/generate obvious, then layer subtle on top)
- Design complementary rule sets (different angles on same problem)
- Build redundant paths (multiple ways to achieve the same goal)
- Create adaptive thresholds (more signals = lower individual thresholds needed)
- Design hierarchies (broad categories, then specific sub-patterns)
- Build cross-validation between rules (patterns that confirm each other)

**PROMPT ARCHITECTURE PATTERNS:**
- **Intent-First Structure**: Start with WHAT and WHY before HOW
- **Progressive Refinement**: Broad rules → Specific exceptions → Edge cases
- **Failure Recovery**: What to do when primary approach doesn't work
- **Self-Verification**: Built-in checks to verify output meets intent
- **Context Preservation**: Maintain domain language and tone throughout

### 🔍 ENHANCEMENT STRATEGY BASED ON PROMPT TYPE:

**IF IT'S A DETECTION/ANALYSIS PROMPT:**
- Add missing detection patterns from the failure case
- Broaden overly specific rules
- Add combinatorial detection (multiple weak signals)
- Include edge case handling
- Add confidence scoring mechanisms

**IF IT'S A GENERATION PROMPT:**
- Clarify ambiguous instructions
- Add style/tone consistency rules
- Include specific examples of good vs bad output
- Add variety mechanisms to avoid repetition
- Include quality checks

**IF IT'S A TRANSFORMATION PROMPT:**
- Clarify input/output format expectations
- Add handling for edge cases in input
- Include preservation rules (what NOT to change)
- Add validation of transformation correctness

**IF IT'S A CLASSIFICATION PROMPT:**
- Clarify category boundaries
- Add handling for ambiguous cases
- Include confidence thresholds
- Add multi-label handling if needed

### 📏 CRITICAL CONSTRAINTS:

**Token/Variable Requirements** (preserve EXACTLY as they appear):
{{tokensDescription}}

**Length Management:**
- Keep the enhanced prompt under 50,000 characters
- If over limit, prioritize:
  1. Core intent and success criteria
  2. Primary behavior patterns
  3. Most important examples
  4. Edge case handling
- Remove redundancy, not critical instructions

### 🎨 DOMAIN-APPROPRIATE ENHANCEMENTS:

**Preserve the Original Voice:**
- If it's technical, keep it technical
- If it's casual/angry, maintain that energy
- If it uses specific jargon, preserve it
- Don't sanitize unless sanitization IS the goal

**Enhance Based on Domain:**
- Technical prompts: Add version numbers, error messages, specific commands
- Creative prompts: Add variety, style guides, inspiration sources
- Analytical prompts: Add methodology, validation steps, confidence metrics
- Educational prompts: Add scaffolding, examples, common misconceptions

## 📁 OUTPUT INSTRUCTIONS:

1. The directory "{{outputDir}}" already exists with the current prompt
2. EDIT the existing file: {{outputDir}}/{{enhancedFile}} - ENHANCE the prompt that's already there
3. EDIT the existing file: {{outputDir}}/{{analysisFile}} - Complete your analysis there
4. Do NOT create new directories or new files - EDIT the existing ones

**In the enhanced prompt file ({{enhancedFile}}):**
- Start with clear statement of intent and purpose
- Reorganize for clarity if needed (intent → rules → examples → edge cases)
- Add whatever patterns/rules it missed in the failure case
- Strengthen weak areas while preserving what works
- Make examples more realistic and varied
- Ensure all original tokens/variables are preserved

**In the analysis file ({{analysisFile}}):**
- Document the prompt's original intent (as you understood it)
- Explain what it failed to handle and why
- List specific improvements you made
- Show before/after examples of how the enhancement helps
- Include confidence score that the enhancement will prevent similar failures

## ⚠️ UNIVERSAL DON'TS:

- DON'T add hyper-specific examples from just this one failure case
- DON'T change the fundamental purpose of the prompt
- DON'T remove domain-specific language that gives it character
- DON'T make it generic if specificity is its strength
- DON'T optimize for this one failure at the expense of general performance

## 🎯 SUCCESS CRITERIA:

The enhanced prompt should:
1. Still achieve its ORIGINAL intent (not what you think it should do)
2. Handle the failure case that was provided
3. Be more robust against similar failures
4. Maintain the appropriate tone/voice for its domain
5. Be clear enough that another AI would understand exactly what to do

Remember: You're not rewriting the prompt from scratch. You're a SURGEON, making precise improvements while preserving what works. The goal is to make it impossibly good at what it's TRYING to do, not what you think it should do.

The files are ready for you to edit - enhance them with surgical precision.`,
      [
        { key: 'outputDir', description: 'Directory containing the prompt files to edit' },
        { key: 'enhancedFile', description: 'Filename of the prompt file to enhance' },
        { key: 'analysisFile', description: 'Filename of the analysis file to write to' },
        { key: 'contextValuesJson', description: 'JSON representation of the context values used' },
        { key: 'actualOutput', description: 'The actual output that failed expectations' },
        { key: 'tokensDescription', description: 'Description of tokens/variables to preserve' },
      ],
      '2025-08-26T14:00:00Z' // Prompt enhancement analysis
    );

    // Use Handlebars for proper template rendering
    const template = compileTemplate(enhancementPrompt.prompt);
    return template({
      outputDir,
      enhancedFile,
      analysisFile,
      contextValuesJson: JSON.stringify(contextValues, null, 2),
      actualOutput,
      tokensDescription:
        tokensDescription || 'None specified - but preserve any ${variable} patterns you find',
    });
  }

  /**
   * Create initial analysis of what the prompt produced vs expected
   */
  private analyzePromptFailure(
    existingPrompt: string,
    contextValues: Record<string, string>,
    actualOutput: string
  ): string {
    return `# Prompt Enhancement Analysis
**Status:** FAILED - Output was unacceptable
**Escalation:** Human called in prompt specialist
**Mission:** Fix this prompt so it actually works

## The Prompt Template:
**Length:** ${existingPrompt.length} characters
**Location:** In the enhanced prompt file in this directory

## The Context Values (Template Replacements):
\`\`\`json
${JSON.stringify(contextValues, null, 2)}
\`\`\`

## What The Prompt Produced (COMPLETE OUTPUT):
\`\`\`
${actualOutput}
\`\`\`

## Analysis Tasks:
1. What was this prompt TRYING to accomplish?
2. How did the output fail to meet expectations?
3. What specific improvements would fix this?
4. How should the enhanced prompt handle similar contexts better?

`;
  }
}
