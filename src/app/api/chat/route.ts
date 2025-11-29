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

export const runtime = "nodejs";
export const maxDuration = 60; // 60 seconds max execution time

// --- RATE LIMITING ---
const RATE_LIMIT = {
  requests: 20, // requests per window
  windowMs: 60 * 1000, // 1 minute
};

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const userLimit = rateLimitStore.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    rateLimitStore.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT.windowMs,
    });
    return { allowed: true, remaining: RATE_LIMIT.requests - 1 };
  }

  if (userLimit.count >= RATE_LIMIT.requests) {
    return { allowed: false, remaining: 0 };
  }

  userLimit.count++;
  return { allowed: true, remaining: RATE_LIMIT.requests - userLimit.count };
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [userId, limit] of rateLimitStore.entries()) {
    if (now > limit.resetAt) {
      rateLimitStore.delete(userId);
    }
  }
}, 60 * 1000);

// --- FILE PROCESSING HELPERS (Unchanged) ---

// File validation constants
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
  const textMimeTypes = ['text/', 'application/json', 'application/javascript', 'application/xml', 'application/x-python-script', 'application/typescript'];
  return textMimeTypes.some(type => file.type.startsWith(type) || file.type === 'application/octet-stream');
}

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

// --- MAIN HANDLER ---

export async function POST(req: NextRequest) {
  try {
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

    // 2. RATE LIMITING CHECK
    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': RATE_LIMIT.requests.toString(),
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

    // 4. FILE VALIDATION
    let totalFileSize = 0;
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `File "${file.name}" exceeds maximum size of 25MB` }, { status: 413 });
      }
      totalFileSize += file.size;
      if (!ALLOWED_FILE_TYPES.includes(file.type) && !file.type.startsWith('image/') && !isTextBased(file)) {
        return NextResponse.json({ error: `File type "${file.type}" is not supported` }, { status: 400 });
      }
    }
    if (totalFileSize > MAX_TOTAL_FILES_SIZE) {
      return NextResponse.json({ error: `Total file size exceeds maximum of 50MB` }, { status: 413 });
    }

    // 5. PROCESS CONTENT
    let textContent = input;
    // Vercel AI SDK 'google' provider expects images as URLs or Base64. We collect URLs.
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
        // Add other document parsers (DOCX, PPTX) if uploaded directly here
      });
      await Promise.all(filePromises);
    }

    if (!textContent.trim() && imageUrls.length === 0) {
        return NextResponse.json({ error: "Input is empty." }, { status: 400 });
    }

    // 6. SETUP GOOGLE AI PROVIDERS & MODEL SELECTION
    
    // Initialize provider for "Daily" tasks (Faster/Cheaper)
    const googleDaily = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY_DAILY,
    });

    // Initialize provider for "Complex" tasks (Coding/Vision/Reasoning)
    const googleComplex = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY_COMPLEX,
    });

    let selectedModel;
    const codingKeywords = ['code', 'python', 'javascript', 'react', 'error', 'debug', 'typescript', 'java', 'c++'];
    const isCodingRequest = codingKeywords.some(keyword => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(textContent));

    if (hasImage) {
        // Images require the Pro model (Multimodal)
        selectedModel = googleComplex('gemini-2.5-pro');
    } else if (taskType === 'coding' || isCodingRequest) {
        // Coding requires better reasoning
        selectedModel = googleComplex('gemini-2.5-pro');
    } else if (taskType === 'daily') {
        // Daily tasks use Flash
        selectedModel = googleDaily('gemini-2.5-flash');
    } else {
        // Fallback auto-detect
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

    // Construct user content (Text + Images)
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

    // 9. TRANSFORM STREAM TO FRONTEND-COMPATIBLE SSE
    // The frontend expects OpenAI-style "data: { choices: [...] }" chunks.
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of result.textStream) {
            // Mimic OpenAI chunk format for compatibility with useStreamingChat.ts
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
        'X-RateLimit-Limit': RATE_LIMIT.requests.toString(),
        'X-RateLimit-Remaining': rateCheck.remaining.toString(),
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Error in /api/chat:", errorMessage, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}