// src/app/api/chat-iq1/route.ts
// Custom IQ1 Model Integration

import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from '@/lib/firebase-admin';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const runtime = "nodejs";
export const maxDuration = 60;

// Rate limiting setup
let ratelimit: Ratelimit | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '60 s'), // 30 requests per minute for IQ1
    analytics: true,
    prefix: 'auraiq:iq1:ratelimit',
  });
}

// IQ1 Model Configuration
interface IQ1Config {
  endpoint: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

const IQ1_CONFIGS = {
  // OpenAI-compatible endpoint (for fine-tuned models)
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.IQ1_OPENAI_API_KEY || '',
    model: process.env.IQ1_MODEL_NAME || 'gpt-4o',
    maxTokens: 4096,
    temperature: 0.7,
  },
  // Hugging Face Inference API
  huggingface: {
    endpoint: 'https://api-inference.huggingface.co/models/',
    apiKey: process.env.IQ1_HF_API_KEY || '',
    model: process.env.IQ1_HF_MODEL || 'meta-llama/Llama-3.1-8B-Instruct',
    maxTokens: 4096,
    temperature: 0.7,
  },
  // Custom endpoint (for self-hosted models)
  custom: {
    endpoint: process.env.IQ1_CUSTOM_ENDPOINT || '',
    apiKey: process.env.IQ1_CUSTOM_API_KEY || '',
    model: process.env.IQ1_CUSTOM_MODEL || 'iq1-base',
    maxTokens: 4096,
    temperature: 0.7,
  },
  // Replicate API (for hosted models)
  replicate: {
    endpoint: 'https://api.replicate.com/v1/predictions',
    apiKey: process.env.IQ1_REPLICATE_API_KEY || '',
    model: process.env.IQ1_REPLICATE_MODEL || '',
    maxTokens: 4096,
    temperature: 0.7,
  },
};

// Get active IQ1 configuration
function getIQ1Config(): IQ1Config {
  const provider = process.env.IQ1_PROVIDER as keyof typeof IQ1_CONFIGS || 'openai';
  return IQ1_CONFIGS[provider];
}

// OpenAI-compatible inference
async function callOpenAICompatible(
  config: IQ1Config,
  messages: any[],
  signal: AbortSignal
) {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`IQ1 API error: ${response.statusText}`);
  }

  return response;
}

// Hugging Face inference
async function callHuggingFace(
  config: IQ1Config,
  messages: any[],
  signal: AbortSignal
) {
  const prompt = messages.map(m => 
    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
  ).join('\n\n');

  const response = await fetch(`${config.endpoint}${config.model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: config.maxTokens,
        temperature: config.temperature,
        return_full_text: false,
      },
      options: {
        wait_for_model: true,
      }
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Hugging Face API error: ${response.statusText}`);
  }

  return response;
}

// Replicate inference
async function callReplicate(
  config: IQ1Config,
  messages: any[],
  signal: AbortSignal
) {
  const prompt = messages.map(m => 
    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
  ).join('\n\n');

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: config.model,
      input: {
        prompt,
        max_length: config.maxTokens,
        temperature: config.temperature,
      },
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Replicate API error: ${response.statusText}`);
  }

  return response;
}

// Main IQ1 inference function
async function callIQ1Model(
  messages: any[],
  signal: AbortSignal
): Promise<Response> {
  const config = getIQ1Config();
  const provider = process.env.IQ1_PROVIDER || 'openai';

  console.log(`🤖 Calling IQ1 model via ${provider}...`);

  switch (provider) {
    case 'openai':
    case 'custom':
      return callOpenAICompatible(config, messages, signal);
    
    case 'huggingface':
      return callHuggingFace(config, messages, signal);
    
    case 'replicate':
      return callReplicate(config, messages, signal);
    
    default:
      throw new Error(`Unknown IQ1 provider: ${provider}`);
  }
}

// Stream transformer for different providers
function transformStream(provider: string, stream: ReadableStream): ReadableStream {
  if (provider === 'openai' || provider === 'custom') {
    // OpenAI format is already SSE-compatible
    return stream;
  }

  // Transform other formats to OpenAI-compatible SSE
  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          
          // Transform to OpenAI format
          const payload = {
            choices: [{
              delta: { content: chunk }
            }]
          };
          
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );
        }
        
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });
}

// Main POST handler
export async function POST(req: NextRequest) {
  try {
    // 1. Authentication
    const authToken = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(authToken);
    const userId = decodedToken.uid;

    // 2. Rate limiting
    if (ratelimit) {
      const { success, limit, remaining } = await ratelimit.limit(userId);
      
      if (!success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { 
            status: 429,
            headers: {
              'X-RateLimit-Limit': limit.toString(),
              'X-RateLimit-Remaining': '0',
              'Retry-After': '60',
            }
          }
        );
      }
    }

    // 3. Parse request
    const { messages, systemPrompt } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      );
    }

    // 4. Prepare messages with system prompt
    const iq1Messages = systemPrompt 
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    // 5. Call IQ1 model
    const abortController = new AbortController();
    const provider = process.env.IQ1_PROVIDER || 'openai';
    
    const response = await callIQ1Model(iq1Messages, abortController.signal);

    if (!response.body) {
      throw new Error('No response body from IQ1 model');
    }

    // 6. Transform and stream response
    const transformedStream = transformStream(provider, response.body);

    return new Response(transformedStream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Model-Provider': provider,
        'X-Model-Name': getIQ1Config().model,
      }
    });

  } catch (error) {
    console.error('❌ IQ1 API error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}