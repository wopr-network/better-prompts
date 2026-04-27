/**
 * Admin Prompts Evolution API - Evolve any prompt based on failed output
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/dal';
import { JobManager } from '@/lib/job-manager';
import { JobType } from '@/types/job';

export async function POST(request: NextRequest) {
  try {
    // Check admin authorization
    const user = await getUser();
    if (!user || user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { 
      promptKey, 
      existingPrompt, 
      contextValues, 
      actualOutput, 
      tokens 
    } = body;

    // Validate required fields
    if (!promptKey || typeof promptKey !== 'string') {
      return NextResponse.json({ 
        error: 'promptKey is required and must be a string',
        success: false 
      }, { status: 400 });
    }

    if (!existingPrompt || typeof existingPrompt !== 'string') {
      return NextResponse.json({ 
        error: 'existingPrompt is required and must be a string',
        success: false 
      }, { status: 400 });
    }

    if (!actualOutput || typeof actualOutput !== 'string') {
      return NextResponse.json({ 
        error: 'actualOutput is required and must be a string',
        success: false 
      }, { status: 400 });
    }

    if (!contextValues || typeof contextValues !== 'object') {
      return NextResponse.json({ 
        error: 'contextValues is required and must be an object',
        success: false 
      }, { status: 400 });
    }

    // Create a prompt enhancement job
    const job = await JobManager.createJob(
      `prompt-enhancement-${promptKey}-${Date.now()}`,
      JobType.PROMPT_ENHANCEMENT,
      {
        requestedBy: 'admin-ui',
        generationType: 'user-request',
      },
      {
        promptKey,
        existingPrompt,
        contextValues,
        actualOutput,
        tokens: tokens || [],
      }
    );

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: `Created prompt enhancement job for ${promptKey}`,
      status: 'queued',
    });

  } catch (error) {
    console.error('Prompt evolution API error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to evolve prompt',
      success: false 
    }, { status: 500 });
  }
}
