'use client';

import { Plus, X, Save, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { PromptToken } from '@/types/prompt';

interface PromptEditorProps {
  promptType?: string;
  initialContent?: string;
  initialTokens?: PromptToken[];
  isEditing?: boolean;
}

export function PromptEditor({ 
  promptType = '', 
  initialContent = '', 
  initialTokens = [], 
  isEditing = false 
}: PromptEditorProps) {
  const router = useRouter();
  const [type, setType] = useState(promptType);
  const [content, setContent] = useState(initialContent);
  const [tokens, setTokens] = useState<PromptToken[]>(initialTokens);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [newToken, setNewToken] = useState<Partial<PromptToken>>({
    key: '',
    description: '',
    example: ''
  });

  const addToken = () => {
    if (!newToken.key || !newToken.description) {
      setError('Token key and description are required');
      return;
    }

    const token: PromptToken = {
      key: newToken.key,
      description: newToken.description,
      example: newToken.example || undefined
    };

    setTokens([...tokens, token]);
    setNewToken({ key: '', description: '', example: '' });
    setError('');
  };

  const removeToken = (index: number) => {
    setTokens(tokens.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!type.trim()) {
      setError('Prompt type is required');
      return;
    }

    if (!content.trim()) {
      setError('Prompt content is required');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/admin/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: type.toLowerCase(),
          content,
          tokens,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save prompt');
      }

      router.push('/admin/prompts');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prompt');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {isEditing ? 'Edit Prompt' : 'Create New Prompt'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-destructive/15 text-destructive px-3 py-2 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="type">Prompt Type</Label>
              <Input
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="e.g., humanizer, research, email-assessment"
                disabled={isEditing}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Unique identifier for this prompt category
              </p>
            </div>

            <div>
              <Label htmlFor="content">Prompt Content</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter the full prompt template here..."
                rows={15}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {`\${variable}`} syntax for token placeholders
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tokens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing tokens */}
          {tokens.length > 0 && (
            <div className="space-y-2">
              {tokens.map((token, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{token.key}</Badge>
                      <span className="text-sm">{token.description}</span>
                    </div>
                    {token.example && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Example: {token.example}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeToken(index)}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add new token */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 border border-dashed rounded-lg">
            <div>
              <Label htmlFor="token-key">Token Key</Label>
              <Input
                id="token-key"
                value={newToken.key || ''}
                onChange={(e) => setNewToken({ ...newToken, key: e.target.value })}
                placeholder="${variable}"
              />
            </div>
            <div>
              <Label htmlFor="token-description">Description</Label>
              <Input
                id="token-description"
                value={newToken.description || ''}
                onChange={(e) => setNewToken({ ...newToken, description: e.target.value })}
                placeholder="What this token represents"
              />
            </div>
            <div>
              <Label htmlFor="token-example">Example (optional)</Label>
              <Input
                id="token-example"
                value={newToken.example || ''}
                onChange={(e) => setNewToken({ ...newToken, example: e.target.value })}
                placeholder="Sample value"
              />
            </div>
            <div className="md:col-span-3">
              <Button onClick={addToken} variant="outline" size="sm" className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Add Token
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          <Save className="w-4 h-4 mr-2" />
          {isSubmitting ? 'Saving...' : 'Save Prompt'}
        </Button>
      </div>
    </div>
  );
}
