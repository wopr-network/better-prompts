# Prompt Evolution System

A sophisticated system for evolving AI humanizer prompts based on failure analysis and continuous improvement.

## Components

### 1. PromptEnhancerAgent (`src/lib/prompt-enhancer-agent.ts`)
- Takes a humanizer prompt that failed to catch AI patterns
- Analyzes what it missed in specific content  
- Generates an improved version that would catch those patterns
- Preserves essential token substitutions and comprehensive structure

### 2. PromptEvolutionService (`src/lib/prompt-evolution-service.ts`)
- Orchestrates the evolution of humanizer prompts
- Integrates with the Redis-backed PromptStore
- Manages version history and comparisons
- Provides rollback capabilities

### 3. PromptStore (`src/lib/prompt-store.ts`)
- Redis-backed storage for versioned prompts
- Maintains ordered list (newest at index 0)
- Stores prompts with metadata: id, version, createdAt, tokens

## Usage

### Seed Initial Prompt
```bash
npm run prompts:seed
```

### Test the Enhancer Agent
```bash
npm run prompts:test-enhancer
```

### Test Full Evolution Service
```bash
npm run prompts:test-evolution
```

## API Examples

### Basic Enhancement
```typescript
import { PromptEnhancerAgent } from '@/lib/prompt-enhancer-agent';

const enhancer = new PromptEnhancerAgent();
const result = await enhancer.enhancePrompt(
  existingPrompt,
  failedContent,
  tokens
);
```

### Full Evolution Workflow
```typescript
import { PromptEvolutionService } from '@/lib/prompt-evolution-service';

const evolution = new PromptEvolutionService();

// Evolve based on failed content
const result = await evolution.evolveHumanizerPrompt(
  failedContent,
  'Optional description of what failed'
);

// Get version history
const history = await evolution.getEvolutionHistory(5);

// Compare versions
const comparison = await evolution.comparePrompts(1, 0); // old vs new

// Rollback if needed
const rolledBack = await evolution.rollbackToVersion(2);
```

## Token System

The prompt evolution system preserves these required tokens:

- `${reportDir}` - Directory name for analysis outputs
- `${reportFile}` - Target markdown filename for generated reports  
- `${content}` - Raw input content to analyze and humanize

## How It Works

1. **Failure Detection**: When humanizer misses AI patterns in content
2. **Analysis**: PromptEnhancerAgent analyzes what was missed and why
3. **Enhancement**: Generates improved prompt version with better detection
4. **Storage**: New version stored in Redis with incremented version number
5. **Integration**: ContentHumanizerAgent automatically uses latest version

## Key Features

- **Preserves Structure**: Maintains all sections and comprehensive nature
- **Generic Patterns**: Makes detection rules more generalizable  
- **Realistic Examples**: Improves examples to be more authentic
- **Version Control**: Full history with comparison and rollback
- **Automatic Integration**: New prompts immediately available to humanizer

## Architecture

```
Failed Content → PromptEnhancerAgent → Enhanced Prompt
     ↓                                       ↓
PromptEvolutionService ← Redis PromptStore ←┘
     ↓
ContentHumanizerAgent (uses latest automatically)
```

The system creates a continuous improvement loop where each failure teaches the prompt to be better at detecting AI patterns.
