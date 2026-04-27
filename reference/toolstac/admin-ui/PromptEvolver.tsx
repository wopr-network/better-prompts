'use client';

import { FileText, Zap, AlertTriangle, Sparkles, History, Edit3 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import type { Prompt, PromptInvocation } from '@/types/prompt';

interface PromptEvolverProps {
  prompt: Prompt;
  promptKey: string; // The key from URL params (e.g., 'humanizer', 'research')
}

export function PromptEvolver({ prompt, promptKey }: PromptEvolverProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'manual' | 'select'>('select');
  const [invocations, setInvocations] = useState<PromptInvocation[]>([]);
  const [selectedInvocation, setSelectedInvocation] = useState<string>('');
  const [actualOutput, setActualOutput] = useState('');
  const [contextValues, setContextValues] = useState<Record<string, string>>({});
  const [bossFeedback, setBossFeedback] = useState('');
  const [isEvolving, setIsEvolving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    enhancedPrompt: string;
    analysis: string;
  } | null>(null);

  // Load invocations on component mount
  useEffect(() => {
    const fetchInvocations = async () => {
      try {
        const response = await fetch(`/api/admin/prompts/${promptKey}/invocations`);
        if (response.ok) {
          const data = await response.json();
          setInvocations(data.invocations || []);
        }
      } catch (error) {
        console.error('Failed to load invocations:', error);
      }
    };

    fetchInvocations();
  }, [promptKey]);

  // Initialize context values from prompt tokens
  useState(() => {
    const initialValues: Record<string, string> = {};
    prompt.tokens.forEach(token => {
      initialValues[token.key] = token.example || '';
    });
    setContextValues(initialValues);
  });

  const updateContextValue = (key: string, value: string) => {
    setContextValues(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Load data from selected invocation
  const loadFromInvocation = (invocationIndex: string) => {
    const index = parseInt(invocationIndex);
    if (invocations[index]) {
      const invocation = invocations[index];
      setContextValues(invocation.templateVars);
      setActualOutput(invocation.output);
      setSelectedInvocation(invocationIndex);
    }
  };

  const evolvePrompt = async () => {
    if (!actualOutput.trim()) {
      setError('Please provide the actual output that was unsatisfactory');
      return;
    }

    // Validate that all required tokens have values
    const missingTokens = prompt.tokens.filter(token => 
      token.key.startsWith('${') && !contextValues[token.key]?.trim()
    );
    
    if (missingTokens.length > 0) {
      setError(`Please provide values for: ${missingTokens.map(t => t.key).join(', ')}`);
      return;
    }

    setIsEvolving(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/admin/prompts/evolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptKey,
          existingPrompt: prompt.prompt,
          contextValues,
          actualOutput,
          tokens: prompt.tokens,
          metadata: {
            bossFeedback: bossFeedback.trim() || undefined,
            analysisNotes: `Evolving ${promptKey} prompt based on failed output`,
          },
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to evolve prompt');
      }

      setResult({
        enhancedPrompt: data.enhancedPrompt,
        analysis: data.analysis,
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to evolve prompt');
    } finally {
      setIsEvolving(false);
    }
  };

  const saveEvolution = async () => {
    if (!result) {return;}

    try {
      const response = await fetch('/api/admin/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: promptKey,
          content: result.enhancedPrompt,
          tokens: prompt.tokens,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to save evolved prompt');
      }

      router.push('/admin/prompts');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save evolved prompt');
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Current Prompt
            <Badge variant="outline">v{prompt.version}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 p-4 rounded-lg">
            <pre className="text-sm whitespace-pre-wrap">{prompt.prompt}</pre>
          </div>
          
          {prompt.tokens.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Available Tokens:</h4>
              <div className="flex flex-wrap gap-2">
                {prompt.tokens.map((token, index) => (
                  <Badge key={index} variant="secondary">
                    {token.key} - {token.description}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mode Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Choose Input Method</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button
              variant={mode === 'select' ? 'default' : 'outline'}
              onClick={() => setMode('select')}
              className="flex-1"
            >
              <History className="w-4 h-4 mr-2" />
              Select from History
            </Button>
            <Button
              variant={mode === 'manual' ? 'default' : 'outline'}
              onClick={() => setMode('manual')}
              className="flex-1"
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Manual Input
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Select from Invocations */}
      {mode === 'select' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Select Previous Invocation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invocations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No previous invocations found for this prompt</p>
                <Button
                  variant="outline"
                  onClick={() => setMode('manual')}
                  className="mt-4"
                >
                  Switch to Manual Input
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Select value={selectedInvocation} onValueChange={loadFromInvocation}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an invocation to evolve from..." />
                  </SelectTrigger>
                  <SelectContent>
                    {invocations.map((invocation, index) => (
                      <SelectItem key={index} value={index.toString()}>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {new Date(invocation.date).toLocaleString()}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            Output: {invocation.output.substring(0, 100)}...
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {selectedInvocation && (
                  <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-medium mb-2">Selected Invocation:</h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <strong>Date:</strong> {new Date(invocations[parseInt(selectedInvocation)].date).toLocaleString()}
                      </div>
                      <div>
                        <strong>Template Variables:</strong>
                        <pre className="mt-1 text-xs bg-background p-2 rounded">
                          {JSON.stringify(invocations[parseInt(selectedInvocation)].templateVars, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <strong>Output:</strong>
                        <div className="mt-1 max-h-32 overflow-y-auto bg-background p-2 rounded text-xs">
                          {invocations[parseInt(selectedInvocation)].output}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Context Values Input */}
      {mode === 'manual' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Context Values
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Provide the actual values that were used when this prompt failed
            </p>
          
          {prompt.tokens.map((token, index) => (
            <div key={index}>
              <Label htmlFor={`token-${index}`}>
                {token.key}
                <span className="text-muted-foreground ml-2">- {token.description}</span>
              </Label>
              <Textarea
                id={`token-${index}`}
                value={contextValues[token.key] || ''}
                onChange={(e) => updateContextValue(token.key, e.target.value)}
                placeholder={token.example || `Enter value for ${token.key}`}
                rows={3}
              />
            </div>
          ))}

          {prompt.tokens.length === 0 && (
            <div className="text-center py-4 text-muted-foreground">
              <p>No tokens defined for this prompt</p>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Boss Feedback - shown for both modes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Boss Feedback (Optional)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="boss-feedback">What specific issues need to be addressed?</Label>
          <Textarea
            id="boss-feedback"
            value={bossFeedback}
            onChange={(e) => setBossFeedback(e.target.value)}
            placeholder="e.g., 'The output is too generic, needs more specific examples' or 'Too wordy, make it more concise'"
            rows={3}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Optional feedback to guide the prompt improvement process
          </p>
        </CardContent>
      </Card>

      {/* Failed Output Input - shown for both modes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Failed Output
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="actual-output">What did the prompt actually produce?</Label>
          <Textarea
            id="actual-output"
            value={actualOutput}
            onChange={(e) => setActualOutput(e.target.value)}
            placeholder="Paste the actual output that was unsatisfactory..."
            rows={8}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-2">
            This is what the prompt generated that you want to improve upon
          </p>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <div className="bg-destructive/15 text-destructive px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Evolution Button */}
      <div className="flex justify-center">
        <Button 
          onClick={evolvePrompt} 
          disabled={isEvolving}
          size="lg"
          className="w-full max-w-md"
        >
          <Sparkles className="w-5 h-5 mr-2" />
          {isEvolving ? 'Evolving Prompt...' : 'Evolve Prompt'}
        </Button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <Separator />
          
          {/* Enhanced Prompt */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                <Sparkles className="w-5 h-5" />
                Enhanced Prompt
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                <pre className="text-sm whitespace-pre-wrap">{result.enhancedPrompt}</pre>
              </div>
            </CardContent>
          </Card>

          {/* Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>Enhancement Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap">{result.analysis}</pre>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setResult(null)}>
              Discard
            </Button>
            <Button onClick={saveEvolution}>
              Save Enhanced Prompt
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
