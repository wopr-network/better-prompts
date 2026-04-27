'use client';

import { FileText, GitBranch, Clock, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Prompt } from '@/types/prompt';

interface PromptWithKey extends Prompt {
  key?: string;
}

interface PromptsTableProps {
  prompts: PromptWithKey[];
}

export function PromptsTable({ prompts }: PromptsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Prompt Management
        </CardTitle>
      </CardHeader>
      <CardContent>
        {prompts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No prompts found. Create your first prompt to get started.</p>
            <Button asChild className="mt-4">
              <Link href="/admin/prompts/new">
                <FileText className="w-4 h-4 mr-2" />
                Create Prompt
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {prompts.map((prompt, index) => (
              <div
                key={prompt.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold">
                      {prompt.id} v{prompt.version}
                    </h3>
                    {index === 0 && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <GitBranch className="w-3 h-3 mr-1" />
                        Latest
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(prompt.createdAt).toLocaleString()}
                    </span>
                    <span>
                      {prompt.prompt.length.toLocaleString()} characters
                    </span>
                    <span>
                      {prompt.tokens.length} tokens
                    </span>
                  </div>
                  
                  <div className="mt-2 text-sm text-muted-foreground">
                    <div className="max-w-md truncate">
                      {prompt.prompt.substring(0, 100)}...
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/prompts/evolve/${prompt.key || prompt.id}`}>
                      <Sparkles className="w-4 h-4" />
                      Evolve
                    </Link>
                  </Button>
                  {index !== 0 && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        // Implement rollback functionality
                        alert(`Rollback to version ${prompt.version} - Not implemented yet`);
                      }}
                    >
                      <GitBranch className="w-4 h-4" />
                      Rollback
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
