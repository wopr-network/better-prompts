// Minimal type for storing prompts in Redis
export interface PromptToken {
  key: string; // e.g. "${reportDir}"
  description: string; // what this token represents
  example?: string; // optional illustrative example value
}

export interface Prompt {
  id: string;
  version: number; // numeric version for ordering/metadata
  createdAt: string; // ISO timestamp
  prompt: string; // full prompt template with placeholders like ${reportDir}
  tokens: PromptToken[]; // list of supported replacement tokens and their purpose
}

// Track prompt usage
export interface PromptInvocation {
  key: string; // prompt key like 'humanizer', 'research'
  templateVars: Record<string, string>; // variables that were substituted
  output: string; // what the AI produced
  date: string; // when this happened
}

// Legacy types for backward compatibility
export type HumanizerToken = PromptToken;
export type HumanizerPrompt = Prompt;
