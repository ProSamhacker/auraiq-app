// src/app/api/chat/route.ts

import { NextRequest, NextResponse } from "next/server";
import { put } from '@vercel/blob';
import { randomUUID } from "crypto";
import { extractText } from 'unpdf';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import { adminAuth } from '@/lib/firebase-admin';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, CoreMessage } from 'ai';

// FIXED: Import Upstash Redis for production-grade rate limiting
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const runtime = "nodejs";
export const maxDuration = 60;

// --- PRODUCTION RATE LIMITING WITH REDIS ---
let ratelimit: Ratelimit | null = null;

// Initialize Redis if credentials are available
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '60 s'),
    analytics: true,
    prefix: 'auraiq:ratelimit',
  });
  
  console.log('✅ Redis rate limiting initialized');
} else {
  console.warn('⚠️ Redis not configured, rate limiting disabled');
}

async function checkRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  if (!ratelimit) {
    // Fallback: allow all requests if Redis is not configured
    return { allowed: true, remaining: 20, limit: 20 };
  }

  const { success, limit, remaining } = await ratelimit.limit(userId);
  
  return {
    allowed: success,
    remaining,
    limit,
  };
}

// --- FILE PROCESSING HELPERS ---

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_TOTAL_FILES_SIZE = 50 * 1024 * 1024; // 50MB total
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/json',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

const isTextBased = (file: File): boolean => {
  const textMimeTypes = ['text/', 'application/json', 'application/javascript', 'application/xml'];
  return textMimeTypes.some(type => file.type.startsWith(type) || file.type === 'application/octet-stream');
};

const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

const truncateContent = (content: string, maxTokens: number = 20000): { content: string, wasTruncated: boolean } => {
  const estimatedTokens = estimateTokens(content);
  if (estimatedTokens <= maxTokens) {
    return { content, wasTruncated: false };
  }
  const maxChars = maxTokens * 4;
  const truncated = content.substring(0, maxChars);
  return { 
    content: truncated + '\n\n[... Content truncated due to size. Total size: ~' + estimatedTokens + ' tokens]',
    wasTruncated: true 
  };
};

// FIXED: Added file content validation
const validateFileContent = async (file: File): Promise<boolean> => {
  // Validate PDF magic number
  if (file.type === 'application/pdf') {
    const buffer = await file.arrayBuffer();
    const arr = new Uint8Array(buffer).subarray(0, 5);
    const header = Array.from(arr).map(b => String.fromCharCode(b)).join('');
    
    if (!header.startsWith('%PDF')) {
      throw new Error('Invalid PDF file - file header does not match PDF format');
    }
  }
  
  // Validate image files
  if (file.type.startsWith('image/')) {
    const buffer = await file.arrayBuffer();
    const arr = new Uint8Array(buffer).subarray(0, 4);
    
    // Check common image signatures
    const signatures: { [key: string]: number[] } = {
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/png': [0x89, 0x50, 0x4E, 0x47],
      'image/gif': [0x47, 0x49, 0x46],
      'image/webp': [0x52, 0x49, 0x46, 0x46],
    };
    
    const expectedSig = signatures[file.type];
    if (expectedSig) {
      for (let i = 0; i < expectedSig.length; i++) {
        if (arr[i] !== expectedSig[i]) {
          throw new Error(`Invalid ${file.type} file - file signature does not match`);
        }
      }
    }
  }
  
  return true;
};

async function extractPPTXImages(buffer: Buffer): Promise<{ imageUrls: string[], text: string }> {
  const imageUrls: string[] = [];
  let text = '';
  try {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    for (const entry of zipEntries) {
      if (entry.entryName.match(/ppt\/slides\/slide\d+\.xml$/i)) {
        try {
          const slideContent = entry.getData().toString('utf8');
          const textMatches = slideContent.match(/<a:t>([^<]+)<\/a:t>/g);
          if (textMatches) {
            textMatches.forEach(match => {
              const textContent = match.replace(/<\/?a:t>/g, '');
              text += textContent + ' ';
            });
            text += '\n\n';
          }
        } catch (e) { console.error('Error extracting text from slide:', e); }
      }
      if (entry.entryName.match(/ppt\/media\/.+\.(jpg|jpeg|png|gif|bmp|svg|webp)/i)) {
        try {
          const imageBuffer = entry.getData();
          const extension = entry.entryName.split('.').pop()?.toLowerCase() || 'png';
          const mimeType = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
          const uniqueFilename = `${randomUUID()}.${extension}`;
          const imageFile = new File([new Uint8Array(imageBuffer)], uniqueFilename, { type: mimeType });
          const blob = await put(uniqueFilename, imageFile, { access: 'public' });
          imageUrls.push(blob.url);
        } catch (e) { console.error('Error processing PPTX image:', e); }
      }
    }
    text = text.trim();
  } catch (e) { console.error('Failed to extract PPTX content:', e); }
  return { imageUrls, text };
}

async function extractDOCXImages(buffer: Buffer): Promise<{ imageUrls: string[], text: string }> {
  const imageUrls: string[] = [];
  let text = '';
  try {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    for (const entry of zipEntries) {
      if (entry.entryName.match(/word\/media\/.+\.(jpg|jpeg|png|gif|bmp|svg)/i)) {
        const imageBuffer = entry.getData();
        const extension = entry.entryName.split('.').pop()?.toLowerCase() || 'png';
        const mimeType = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
        const uniqueFilename = `${randomUUID()}.${extension}`;
        const imageFile = new File([new Uint8Array(imageBuffer)], uniqueFilename, { type: mimeType });
        const blob = await put(uniqueFilename, imageFile, { access: 'public' });
        imageUrls.push(blob.url);
      }
    }
  } catch (e) { console.error('Failed to extract DOCX images:', e); }
  return { imageUrls, text };
}

async function extractPDFContent(buffer: Uint8Array): Promise<{ imageUrls: string[], text: string }> {
  const imageUrls: string[] = [];
  let text = '';
  try {
    const { text: pdfText } = await extractText(buffer);
    text = Array.isArray(pdfText) ? pdfText.join('\n') : pdfText;
  } catch (e) { console.error('Failed to extract PDF content:', e); }
  return { imageUrls, text };
}

// FIXED: Add CSRF protection
function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  
  if (!origin) return true; // Allow same-origin requests
  
  // In production, validate against allowed origins
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  if (allowedOrigins.length > 0) {
    return allowedOrigins.some(allowed => origin.includes(allowed));
  }
  
  // Fallback: check if origin matches host
  return origin.includes(host || '');
}

// --- MAIN HANDLER ---

export async function POST(req: NextRequest) {
  try {
    // FIXED: CSRF Protection
    if (!validateOrigin(req)) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }

    // 1. AUTHENTICATION CHECK
    const authToken = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized - No token provided' }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(authToken);
    } catch (error) {
      console.error('Token verification failed:', error);
      return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
    }

    const userId = decodedToken.uid;

    // 2. FIXED: PRODUCTION RATE LIMITING
    const rateCheck = await checkRateLimit(userId);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateCheck.limit.toString(),
            'X-RateLimit-Remaining': '0',
            'Retry-After': '60',
          }
        }
      );
    }

    // 3. PARSE REQUEST
    const formData = await req.formData();
    const input = formData.get('input') as string;
    const taskType = formData.get('taskType') as string;
    const context = formData.get('context') as string;
    const historyString = formData.get('history') as string;
    const history = JSON.parse(historyString || '[]');
    const files = formData.getAll('files') as File[];
    const contextFileUrlsString = formData.get('contextFileUrls') as string;

    // 4. FIXED: ENHANCED FILE VALIDATION
    let totalFileSize = 0;
    
    for (const file of files) {
      // First check size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ 
          error: `File "${file.name}" exceeds maximum size of 25MB` 
        }, { status: 413 });
      }
      
      totalFileSize += file.size;
      
      // Then check type
      if (!ALLOWED_FILE_TYPES.includes(file.type) && !file.type.startsWith('image/') && !isTextBased(file)) {
        return NextResponse.json({ 
          error: `File type "${file.type}" is not supported` 
        }, { status: 400 });
      }
      
      // FIXED: Validate file content
      try {
        await validateFileContent(file);
      } catch (error) {
        return NextResponse.json({ 
          error: `File validation failed: ${(error as Error).message}` 
        }, { status: 400 });
      }
    }
    
    if (totalFileSize > MAX_TOTAL_FILES_SIZE) {
      return NextResponse.json({ 
        error: `Total file size exceeds maximum of 50MB` 
      }, { status: 413 });
    }

    // 5. PROCESS CONTENT
    let textContent = input;
    const imageUrls: string[] = []; 
    let hasImage = false;

    // Process context files
    if (contextFileUrlsString) {
      const contextFileUrls = JSON.parse(contextFileUrlsString) as string[];
      if (contextFileUrls.length > 0) {
        const fileContentPromises = contextFileUrls.map(async (url) => {
          try {
            const fileName = decodeURIComponent(url.split('/').pop() || 'context file');
            const response = await fetch(url);
            if (response.ok) {
              const contentType = response.headers.get('content-type');
              const buffer = await response.arrayBuffer();
              let fileText = '';
              
              if (contentType && contentType === 'application/pdf') {
                const { imageUrls: pdfImages, text } = await extractPDFContent(new Uint8Array(buffer));
                fileText = text;
                if (pdfImages.length > 0) {
                  hasImage = true;
                  imageUrls.push(...pdfImages);
                }
              } else if (contentType?.includes('wordprocessingml')) {
                const { imageUrls: docImages, text } = await extractDOCXImages(Buffer.from(buffer));
                fileText = text;
                if (docImages.length > 0) {
                  hasImage = true;
                  imageUrls.push(...docImages);
                }
              } else if (contentType?.includes('presentationml')) {
                const { imageUrls: pptImages, text } = await extractPPTXImages(Buffer.from(buffer));
                fileText = text;
                if (pptImages.length > 0) {
                  hasImage = true;
                  imageUrls.push(...pptImages);
                }
              } else if (contentType?.includes('spreadsheetml')) {
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                let content = '';
                const maxRowsPerSheet = 1000;
                workbook.SheetNames.forEach(sheetName => {
                  const worksheet = workbook.Sheets[sheetName];
                  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                  content += `Sheet: ${sheetName}\n`;
                  if (jsonData.length > maxRowsPerSheet) {
                    content += XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(jsonData.slice(0, maxRowsPerSheet))) + `\n[Truncated]\n\n`;
                  } else {
                    content += XLSX.utils.sheet_to_csv(worksheet) + '\n\n';
                  }
                });
                fileText = content;
              } else if (contentType && contentType.startsWith('image/')) {
                hasImage = true;
                imageUrls.push(url);
              } else {
                fileText = new TextDecoder('utf-8').decode(buffer);
              }

              if (fileText) {
                const { content: truncatedText } = truncateContent(fileText, 15000);
                textContent += `\n\n--- Context: ${fileName} ---\n${truncatedText}\n--- End ${fileName} ---`;
              }
            }
          } catch (e) {
            console.error(`Failed to fetch context file ${url}`, e);
          }
        });
        await Promise.all(fileContentPromises);
      }
    }

    // Process uploaded files
    if (files.length > 0) {
      const filePromises = files.map(async (file) => {
        if (file.type.startsWith('image/')) {
          hasImage = true;
          const uniqueFilename = `${randomUUID()}-${file.name}`;
          const blob = await put(uniqueFilename, file, { access: 'public' });
          imageUrls.push(blob.url);
        } else if (file.type === 'application/pdf') {
          const buffer = await file.arrayBuffer();
          const { imageUrls: pdfImages, text } = await extractPDFContent(new Uint8Array(buffer));
          if(text) textContent += `\n\n--- File: ${file.name} ---\n${text}\n--- End ---\n`;
          if(pdfImages.length > 0) { hasImage = true; imageUrls.push(...pdfImages); }
        } else if (isTextBased(file)) {
          const text = await file.text();
          textContent += `\n\n--- File: ${file.name} ---\n${text}\n--- End ---\n`;
        }
      });
      await Promise.all(filePromises);
    }

    if (!textContent.trim() && imageUrls.length === 0) {
      return NextResponse.json({ error: "Input is empty." }, { status: 400 });
    }

    // 6. SETUP GOOGLE AI PROVIDERS & MODEL SELECTION
    const googleDaily = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY_DAILY,
    });

    const googleComplex = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY_COMPLEX,
    });

    let selectedModel;
    const codingKeywords = ['code', 'python', 'javascript', 'react', 'error', 'debug', 'typescript', 'java', 'c++'];
    const isCodingRequest = codingKeywords.some(keyword => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(textContent));

    if (hasImage) {
      selectedModel = googleComplex('gemini-2.5-pro');
    } else if (taskType === 'coding' || isCodingRequest) {
      selectedModel = googleComplex('gemini-2.5-pro');
    } else if (taskType === 'daily') {
      selectedModel = googleDaily('gemini-2.5-flash');
    } else {
      selectedModel = isCodingRequest 
        ? googleComplex('gemini-2.5-pro') 
        : googleDaily('gemini-2.5-flash');
    }

    // 7. PREPARE MESSAGES
    const basePrompt = `You are AuraIQ, a helpful and intelligent AI assistant.
    ALWAYS format your responses using GitHub-flavored Markdown.
    - Use lists for items.
    - Use **bold** for headings and important terms.
    - Use code blocks (\`\`\`language\ncode\n\`\`\`) for code.
    - **IMPORTANT**: For tabular data, ALWAYS use Markdown tables.
    - Ensure proper spacing and line breaks.`;

    const systemMessage = context ? `${context}\n\n${basePrompt}` : basePrompt;

    const formattedHistory: CoreMessage[] = history.slice(-10).map((msg: any) => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.text
    }));

    const userContent: any[] = [{ type: 'text', text: textContent }];
    imageUrls.forEach(url => {
      userContent.push({ type: 'image', image: url });
    });

    const messages: CoreMessage[] = [
      ...formattedHistory,
      { role: 'user', content: userContent }
    ];

    // 8. GENERATE STREAM
    const result = await streamText({
      model: selectedModel,
      system: systemMessage,
      messages: messages,
    });

    // 9. TRANSFORM STREAM
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of result.textStream) {
            const payload = {
              choices: [{ delta: { content: chunk } }]
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error("Stream processing error:", error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-RateLimit-Limit': rateCheck.limit.toString(),
        'X-RateLimit-Remaining': rateCheck.remaining.toString(),
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Error in /api/chat:", errorMessage, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}