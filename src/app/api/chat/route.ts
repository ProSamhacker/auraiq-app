import { NextRequest, NextResponse } from "next/server";
import { put } from '@vercel/blob';
import { randomUUID } from "crypto";
import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import { adminAuth } from '@/lib/firebase-admin';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';

export const runtime = "nodejs";
export const maxDuration = 60;

// --- PRODUCTION RATE LIMITING WITH REDIS ---
let ratelimit: Ratelimit | null = null;

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
    return { allowed: true, remaining: 20, limit: 20 };
  }

  try {
    const { success, limit, remaining } = await ratelimit.limit(userId);

    return {
      allowed: success,
      remaining,
      limit,
    };
  } catch (error) {
    // If Redis fails, log the error and allow the request (graceful degradation)
    console.error('⚠️ Redis rate limit check failed, allowing request:', error);
    return { allowed: true, remaining: 20, limit: 20 };
  }
}

// --- FILE PROCESSING HELPERS ---
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_TOTAL_FILES_SIZE = 50 * 1024 * 1024;
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

const validateFileContent = async (file: File): Promise<boolean> => {
  if (file.type === 'application/pdf') {
    const buffer = await file.arrayBuffer();
    const arr = new Uint8Array(buffer).subarray(0, 5);
    const header = Array.from(arr).map(b => String.fromCharCode(b)).join('');

    if (!header.startsWith('%PDF')) {
      throw new Error('Invalid PDF file - file header does not match PDF format');
    }
  }

  if (file.type.startsWith('image/')) {
    const buffer = await file.arrayBuffer();
    const arr = new Uint8Array(buffer).subarray(0, 4);

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
          const blob = await put(uniqueFilename, imageFile, { access: 'public', addRandomSuffix: true });
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
        const blob = await put(uniqueFilename, imageFile, { access: 'public', addRandomSuffix: true });
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
    console.log(`📄 Extracting PDF content - Buffer size: ${buffer.byteLength} bytes`);

    // First, create a PDF document proxy from the buffer
    const pdf = await getDocumentProxy(buffer);
    console.log(`✅ PDF proxy created successfully - Pages: ${pdf.numPages}`);

    // Then extract text with mergePages option to get a single string
    const { text: pdfText, totalPages } = await extractText(pdf, { mergePages: true });
    text = pdfText;

    console.log(`✅ PDF text extracted - Total pages: ${totalPages}, Text length: ${text.length} characters`);
    console.log(`📝 First 200 chars: ${text.substring(0, 200)}`);

  } catch (e) {
    console.error('❌ Failed to extract PDF content:', e);
    console.error('Error details:', {
      message: (e as Error).message,
      stack: (e as Error).stack
    });
  }
  return { imageUrls, text };
}

// --- GROQ API HELPER (for Daily & Coding lanes) ---
async function callGroq(messages: any[], model: string, signal: AbortSignal) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured on the server.");
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API Error: ${response.status} - ${errorText}`);
  }

  return response;
}

// --- OPENROUTER API HELPER (for Analysis lane with vision) ---
async function callOpenRouter(messages: any[], model: string, signal: AbortSignal) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured on the server.");
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      'X-Title': 'AuraIQ',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API Error: ${response.status} - ${errorText}`);
  }

  return response;
}

function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (!origin) return true;

  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  if (allowedOrigins.length > 0) {
    return allowedOrigins.some(allowed => origin.includes(allowed));
  }

  return origin.includes(host || '');
}

// --- MAIN HANDLER ---

export async function POST(req: NextRequest) {
  try {
    if (!validateOrigin(req)) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }

    // 1. AUTHENTICATION
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

    // 2. RATE LIMITING
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
    // Get requested model
    const requestedModel = formData.get('model') as string; // 'auto', 'gemini-flash', 'gemini-pro', 'iq1-base'
    const context = formData.get('context') as string;
    const historyString = formData.get('history') as string;
    const history = JSON.parse(historyString || '[]');
    const files = formData.getAll('files') as File[]; // Legacy support
    const uploadedFileUrlsString = formData.get('uploadedFileUrls') as string; // New: pre-uploaded files
    const contextFileUrlsString = formData.get('contextFileUrls') as string;

    // 4. FILE VALIDATION
    let totalFileSize = 0;

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({
          error: `File "${file.name}" exceeds maximum size of 25MB`
        }, { status: 413 });
      }

      totalFileSize += file.size;

      if (!ALLOWED_FILE_TYPES.includes(file.type) && !file.type.startsWith('image/') && !isTextBased(file)) {
        return NextResponse.json({
          error: `File type "${file.type}" is not supported`
        }, { status: 400 });
      }

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


    // Process pre-uploaded files (client-side direct upload)
    if (uploadedFileUrlsString) {
      const uploadedFileUrls = JSON.parse(uploadedFileUrlsString) as string[];
      if (uploadedFileUrls.length > 0) {
        const uploadedFilePromises = uploadedFileUrls.map(async (url) => {
          try {
            const fileName = decodeURIComponent(url.split('/').pop() || 'uploaded file');
            const response = await fetch(url);
            if (response.ok) {
              const contentType = response.headers.get('content-type');
              const buffer = await response.arrayBuffer();

              if (contentType && contentType.startsWith('image/')) {
                hasImage = true;
                imageUrls.push(url);
              } else if (contentType === 'application/pdf') {
                const { imageUrls: pdfImages, text } = await extractPDFContent(new Uint8Array(buffer));
                if (text) textContent += `\n\n--- File: ${fileName} ---\n${text}\n--- End ---\n`;
                if (pdfImages.length > 0) { hasImage = true; imageUrls.push(...pdfImages); }
              } else if (contentType?.includes('wordprocessingml')) {
                const { imageUrls: docImages, text } = await extractDOCXImages(Buffer.from(buffer));
                if (text) textContent += `\n\n--- File: ${fileName} ---\n${text}\n--- End ---\n`;
                if (docImages.length > 0) { hasImage = true; imageUrls.push(...docImages); }
              } else if (contentType?.includes('presentationml')) {
                const { imageUrls: pptImages, text } = await extractPPTXImages(Buffer.from(buffer));
                if (text) textContent += `\n\n--- File: ${fileName} ---\n${text}\n--- End ---\n`;
                if (pptImages.length > 0) { hasImage = true; imageUrls.push(...pptImages); }
              } else if (contentType?.includes('spreadsheetml')) {
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                let content = '';
                workbook.SheetNames.forEach(sheetName => {
                  const worksheet = workbook.Sheets[sheetName];
                  content += `Sheet: ${sheetName}\n` + XLSX.utils.sheet_to_csv(worksheet) + '\n\n';
                });
                if (content) textContent += `\n\n--- File: ${fileName} ---\n${content}\n--- End ---\n`;
              } else {
                // Text-based file
                const text = new TextDecoder('utf-8').decode(buffer);
                if (text) textContent += `\n\n--- File: ${fileName} ---\n${text}\n--- End ---\n`;
              }
            }
          } catch (e) {
            console.error(`Failed to fetch uploaded file ${url}`, e);
          }
        });
        await Promise.all(uploadedFilePromises);
      }
    }

    // Process uploaded files (legacy support for old clients)
    if (files.length > 0) {
      const filePromises = files.map(async (file) => {
        if (file.type.startsWith('image/')) {
          hasImage = true;
          const uniqueFilename = `${randomUUID()}-${file.name}`;
          const blob = await put(uniqueFilename, file, { access: 'public', addRandomSuffix: true });
          imageUrls.push(blob.url);
        } else if (file.type === 'application/pdf') {
          const buffer = await file.arrayBuffer();
          const { imageUrls: pdfImages, text } = await extractPDFContent(new Uint8Array(buffer));
          if (text) textContent += `\n\n--- File: ${file.name} ---\n${text}\n--- End ---\n`;
          if (pdfImages.length > 0) { hasImage = true; imageUrls.push(...pdfImages); }
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

    // 6. THREE-LANE MODEL ROUTING (Groq + OpenRouter)
    const abortController = new AbortController();

    // Determine which lane/model to use
    let selectedModel: string;
    let selectedProvider: 'groq' | 'openrouter' | 'gemini';
    let modelName: string;

    const codingKeywords = ['code', 'python', 'javascript', 'react', 'error', 'debug', 'typescript', 'java', 'c++', 'function', 'class', 'algorithm'];
    const isCodingRequest = codingKeywords.some(keyword => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(textContent));

    // LANE SELECTION LOGIC
    if (requestedModel === 'gemini-flash' || requestedModel === 'iq1-base') {
      // DAILY LANE: Fast general chat
      selectedModel = process.env.AI_MODEL_DAILY || 'llama-3.1-8b-instant';
      selectedProvider = (process.env.AI_PROVIDER_DAILY as 'groq' | 'openrouter') || 'groq';
      modelName = 'Llama 3.1 8B (Daily)';
    } else if (requestedModel === 'gemini-pro') {
      // CODING LANE: Complex reasoning
      selectedModel = process.env.AI_MODEL_CODING || 'llama-3.3-70b-versatile';
      selectedProvider = (process.env.AI_PROVIDER_CODING as 'groq' | 'openrouter') || 'groq';
      modelName = 'Llama 3.3 70B (Coding)';
    } else {
      // AUTO-SELECTION LOGIC
      if (hasImage || files.length > 0) {
        // Detect file types to determine routing
        const hasMediaFiles = imageUrls.length > 0 || files.some(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
        const hasDocuments = files.some(f =>
          f.type === 'application/pdf' ||
          f.type.includes('document') ||
          f.type.includes('presentation') ||
          f.type.includes('spreadsheet') ||
          f.type.includes('text/')
        );

        if (hasMediaFiles) {
          // MEDIA ANALYSIS (images, videos) → Gemini with vision
          selectedModel = process.env.AI_MODEL_ANALYSIS || 'gemini-2.5-flash';
          selectedProvider = (process.env.AI_PROVIDER_ANALYSIS as 'groq' | 'openrouter' | 'gemini') || 'gemini';
          modelName = 'Gemini 2.5 Flash (Media Analysis)';
        } else if (hasDocuments) {
          // DOCUMENT ANALYSIS (PDF, PPT, DOC) → Groq Llama 3.3 70B
          selectedModel = 'llama-3.3-70b-versatile';
          selectedProvider = 'groq';
          modelName = 'Llama 3.3 70B (Document Analysis)';
        } else {
          // Other files → Use analysis model
          selectedModel = process.env.AI_MODEL_ANALYSIS || 'gemini-2.5-flash';
          selectedProvider = (process.env.AI_PROVIDER_ANALYSIS as 'groq' | 'openrouter' | 'gemini') || 'gemini';
          modelName = 'Gemini 2.5 Flash (Analysis)';
        }
      } else if (taskType === 'coding' || isCodingRequest) {
        // CODING LANE
        selectedModel = process.env.AI_MODEL_CODING || 'llama-3.3-70b-versatile';
        selectedProvider = (process.env.AI_PROVIDER_CODING as 'groq' | 'openrouter') || 'groq';
        modelName = 'Llama 3.3 70B (Coding)';
      } else {
        // DAILY LANE (default)
        selectedModel = process.env.AI_MODEL_DAILY || 'llama-3.1-8b-instant';
        selectedProvider = (process.env.AI_PROVIDER_DAILY as 'groq' | 'openrouter') || 'groq';
        modelName = 'Llama 3.1 8B (Daily)';
      }
    }

    console.log(`🤖 Using ${selectedProvider.toUpperCase()}: ${modelName} (requested: ${requestedModel || 'auto'})`);

    // Prepare system prompt
    const basePrompt = `You are AuraIQ, a helpful and intelligent AI assistant.

**CRITICAL**: When users upload files (PDF, PPT, Word, Excel), content is auto-extracted and included in the message marked with "--- Context: filename ---". You CAN see and analyze this content directly. DO NOT say you cannot access files.

ALWAYS format your responses using GitHub-flavored Markdown.
- Use lists for items.
- Use **bold** for headings and important terms.
- Use code blocks (\`\`\`language\\ncode\\n\`\`\`) for code.
- **IMPORTANT**: For tabular data, ALWAYS use Markdown tables.
- Ensure proper spacing and line breaks.`;

    const systemMessage = context ? `${context}\\n\\n${basePrompt}` : basePrompt;

    // Prepare conversation history
    const conversationHistory = history.slice(-10).map((msg: any) => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.text
    }));

    // Build messages array with system prompt and current message
    let messages: any[] = [
      { role: 'system', content: systemMessage },
      ...conversationHistory,
    ];

    // Call appropriate API based on provider
    let apiResponse: Response;

    if (selectedProvider === 'gemini') {
      // GEMINI DIRECT (for analysis with vision) with automatic failover
      let geminiResult;
      let usedKey = 'daily';

      // Try daily key first, fall back to complex key if quota exceeded
      try {
        const googleAI = createGoogleGenerativeAI({
          apiKey: process.env.GEMINI_API_KEY_DAILY,
        });

        const geminiModel = googleAI(selectedModel);

        // Prepare user content with images
        const userContent: any[] = [{ type: 'text', text: textContent }];
        if (imageUrls.length > 0) {
          imageUrls.forEach(url => {
            userContent.push({ type: 'image', image: url });
          });
        }

        geminiResult = await streamText({
          model: geminiModel,
          system: systemMessage,
          messages: [
            ...conversationHistory,
            { role: 'user', content: userContent }
          ],
        });
      } catch (dailyError: any) {
        // Check if it's a quota error
        const isQuotaError = dailyError?.message?.includes('quota') ||
          dailyError?.message?.includes('429') ||
          dailyError?.message?.includes('RESOURCE_EXHAUSTED');

        if (isQuotaError && process.env.GEMINI_API_KEY_COMPLEX) {
          console.log('⚠️ Daily Gemini key quota exceeded, switching to complex key...');

          // Retry with complex key
          const googleAI = createGoogleGenerativeAI({
            apiKey: process.env.GEMINI_API_KEY_COMPLEX,
          });

          const geminiModel = googleAI(selectedModel);

          const userContent: any[] = [{ type: 'text', text: textContent }];
          if (imageUrls.length > 0) {
            imageUrls.forEach(url => {
              userContent.push({ type: 'image', image: url });
            });
          }

          geminiResult = await streamText({
            model: geminiModel,
            system: systemMessage,
            messages: [
              ...conversationHistory,
              { role: 'user', content: userContent }
            ],
          });

          usedKey = 'complex';
        } else {
          throw dailyError;
        }
      }

      // Transform to standard SSE format
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const chunk of geminiResult.textStream) {
              const payload = { choices: [{ delta: { content: chunk } }] };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            console.error("Gemini Stream Error:", error);
            controller.error(error);
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'X-RateLimit-Limit': rateCheck.limit.toString(),
          'X-RateLimit-Remaining': rateCheck.remaining.toString(),
          'X-Model-Used': `${modelName} (${usedKey} key)`,
          'X-Provider': selectedProvider,
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      });

    } else {
      // GROQ or OPENROUTER
      // Add current user message (with images if using OpenRouter for analysis)
      if (selectedProvider === 'openrouter' && imageUrls.length > 0) {
        // OpenRouter vision model supports images
        const userContent: any[] = [{ type: 'text', text: textContent }];
        imageUrls.forEach(url => {
          userContent.push({ type: 'image_url', image_url: { url } });
        });
        messages.push({ role: 'user', content: userContent });
      } else {
        // Standard text-only message
        messages.push({ role: 'user', content: textContent });
      }

      apiResponse = selectedProvider === 'groq'
        ? await callGroq(messages, selectedModel, abortController.signal)
        : await callOpenRouter(messages, selectedModel, abortController.signal);

      // Transform streaming response to frontend format
      const stream = new ReadableStream({
        async start(controller) {
          const reader = apiResponse.body?.getReader();
          const decoder = new TextDecoder();
          const encoder = new TextEncoder();

          if (!reader) {
            controller.close();
            return;
          }

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');

              for (const line of lines) {
                if (line.startsWith('data:') && line.length > 5) {
                  const data = line.substring(5).trim();
                  if (data === '[DONE]') break;

                  try {
                    const json = JSON.parse(data);
                    const content = json.choices?.[0]?.delta?.content || '';

                    if (content) {
                      const payload = { choices: [{ delta: { content } }] };
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                    }
                  } catch (e) { /* ignore incomplete JSON */ }
                }
              }
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (err) {
            console.error(`${selectedProvider.toUpperCase()} Stream Error:`, err);
            controller.error(err);
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'X-RateLimit-Limit': rateCheck.limit.toString(),
          'X-RateLimit-Remaining': rateCheck.remaining.toString(),
          'X-Model-Used': modelName,
          'X-Provider': selectedProvider,
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Error in /api/chat:", errorMessage, error);
    return NextResponse.json({ error: errorMessage || 'Internal server error' }, { status: 500 });
  }
}