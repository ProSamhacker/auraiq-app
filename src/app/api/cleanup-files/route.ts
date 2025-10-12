// src/app/api/chat/route.ts - FIXED VERSION

import { NextRequest, NextResponse } from "next/server";
import { put } from '@vercel/blob';
import { randomUUID } from "crypto";
import { extractText } from 'unpdf';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import { adminAuth } from '@/lib/firebase-admin';

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = {
  requests: 20,
  windowMs: 60 * 1000,
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

setInterval(() => {
  const now = Date.now();
  for (const [userId, limit] of rateLimitStore.entries()) {
    if (now > limit.resetAt) {
      rateLimitStore.delete(userId);
    }
  }
}, 60 * 1000);

type HistoryMessage = {
  id: string;
  text: string;
  sender: 'user' | 'ai';
};

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
  const textMimeTypes = ['text/', 'application/json', 'application/javascript', 'application/xml', 'application/x-python-script', 'application/typescript'];
  return textMimeTypes.some(type => file.type.startsWith(type) || file.type === 'application/octet-stream');
}

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
        } catch (e) {
          console.error('Error extracting text from slide:', e);
        }
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
        } catch (e) {
          console.error('Error processing PPTX image:', e);
        }
      }
    }
    
    text = text.trim();
    
  } catch (e) {
    console.error('Failed to extract PPTX content:', e);
    throw new Error('Failed to process PowerPoint file');
  }
  
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
  } catch (e) {
    console.error('Failed to extract DOCX images:', e);
  }
  
  return { imageUrls, text };
}

async function extractPDFContent(buffer: Uint8Array): Promise<{ imageUrls: string[], text: string }> {
  const imageUrls: string[] = [];
  let text = '';
  
  try {
    const { text: pdfText } = await extractText(buffer);
    text = Array.isArray(pdfText) ? pdfText.join('\n') : pdfText;
  } catch (e) {
    console.error('Failed to extract PDF content:', e);
  }
  
  return { imageUrls, text };
}

export async function POST(req: NextRequest) {
  try {
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

    const formData = await req.formData();
    const input = formData.get('input') as string;
    const taskType = formData.get('taskType') as string;
    const context = formData.get('context') as string;
    const historyString = formData.get('history') as string;
    const history = JSON.parse(historyString || '[]') as HistoryMessage[];
    const files = formData.getAll('files') as File[];
    const contextFileUrlsString = formData.get('contextFileUrls') as string;

    let totalFileSize = 0;
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds maximum size of 25MB` },
          { status: 413 }
        );
      }
      totalFileSize += file.size;
      
      if (!ALLOWED_FILE_TYPES.includes(file.type) && !file.type.startsWith('image/') && !isTextBased(file)) {
        return NextResponse.json(
          { error: `File type "${file.type}" is not supported` },
          { status: 400 }
        );
      }
    }

    if (totalFileSize > MAX_TOTAL_FILES_SIZE) {
      return NextResponse.json(
        { error: `Total file size exceeds maximum of 50MB` },
        { status: 413 }
      );
    }

    let textContent = input;
    const imageContent: { type: 'image_url'; image_url: { url: string } }[] = [];
    let hasImage = false;

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
                const { imageUrls, text } = await extractPDFContent(new Uint8Array(buffer));
                fileText = text;
                if (imageUrls.length > 0) {
                  hasImage = true;
                  imageUrls.forEach(url => imageContent.push({ type: 'image_url', image_url: { url } }));
                }
              }
              else if (contentType && contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                const { imageUrls, text } = await extractDOCXImages(Buffer.from(buffer));
                fileText = text;
                if (imageUrls.length > 0) {
                  hasImage = true;
                  imageUrls.forEach(url => imageContent.push({ type: 'image_url', image_url: { url } }));
                }
              }
              else if (contentType && contentType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
                const { imageUrls, text } = await extractPPTXImages(Buffer.from(buffer));
                fileText = text;
                if (imageUrls.length > 0) {
                  hasImage = true;
                  imageUrls.forEach(url => imageContent.push({ type: 'image_url', image_url: { url } }));
                }
              }
              else if (contentType && contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                let content = '';
                const maxRowsPerSheet = 1000;
                
                workbook.SheetNames.forEach(sheetName => {
                  content += `Sheet: ${sheetName}\n\n`;
                  const worksheet = workbook.Sheets[sheetName];
                  
                  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
                  
                  if (jsonData.length > maxRowsPerSheet) {
                    const truncatedData = jsonData.slice(0, maxRowsPerSheet);
                    const tempSheet = XLSX.utils.aoa_to_sheet(truncatedData);
                    const sheetData = XLSX.utils.sheet_to_csv(tempSheet);
                    content += sheetData + `\n\n[... Showing first ${maxRowsPerSheet} rows out of ${jsonData.length} total rows]\n\n`;
                  } else {
                    const sheetData = XLSX.utils.sheet_to_csv(worksheet);
                    content += sheetData + '\n\n';
                  }
                });
                
                fileText = content;
              }
              else if (contentType && contentType.startsWith('image/')) {
                hasImage = true;
                imageContent.push({ type: 'image_url', image_url: { url: url } });
              } 
              else {
                const textDecoder = new TextDecoder('utf-8');
                fileText = textDecoder.decode(buffer);
              }

              if (fileText) {
                const { content: truncatedText, wasTruncated } = truncateContent(fileText, 15000);
                textContent += `\n\n--- Content from context file: ${fileName} ---\n${truncatedText}\n--- End of ${fileName} ---`;
                
                if (wasTruncated) {
                  textContent += `\n[Note: Content was truncated due to size]`;
                }
              }
            }
          } catch (e) {
            console.error(`Failed to fetch and process context file from ${url}`, e);
            textContent += `\n\n[System note: Failed to load context from ${url}]`;
          }
        });
        await Promise.all(fileContentPromises);
      }
    }

    if (files.length > 0) {
      const filePromises = files.map(async (file) => {
        if (file.type.startsWith('image/')) {
          hasImage = true;
          const uniqueFilename = `${randomUUID()}-${file.name}`;
          const blob = await put(uniqueFilename, file, { access: 'public' });
          imageContent.push({ type: 'image_url', image_url: { url: blob.url } });
        } 
        else if (file.type === 'application/pdf') {
          try {
            const buffer = await file.arrayBuffer();
            const { imageUrls, text } = await extractPDFContent(new Uint8Array(buffer));
            
            if (text) {
              textContent += `\n\n--- Content of attached file: ${file.name} ---\n${text}\n--- End of ${file.name} ---`;
            }
            
            if (imageUrls.length > 0) {
              hasImage = true;
              imageUrls.forEach(url => imageContent.push({ type: 'image_url', image_url: { url } }));
            }
          } catch (e) {
            console.error(`Failed to process PDF file ${file.name}`, e);
            textContent += `\n\n[System note: Failed to read PDF file ${file.name}]`;
          }
        }
        else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          try {
            const buffer = await file.arrayBuffer();
            const { imageUrls, text } = await extractDOCXImages(Buffer.from(buffer));
            
            if (text) {
              textContent += `\n\n--- Content of attached file: ${file.name} ---\n${text}\n--- End of ${file.name} ---`;
            }
            
            if (imageUrls.length > 0) {
              hasImage = true;
              imageUrls.forEach(url => imageContent.push({ type: 'image_url', image_url: { url } }));
            }
          } catch (e) {
            console.error(`Failed to process DOCX file ${file.name}`, e);
            textContent += `\n\n[System note: Failed to read DOCX file ${file.name}]`;
          }
        }
        else if (file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
          try {
            const buffer = await file.arrayBuffer();
            const { imageUrls, text } = await extractPPTXImages(Buffer.from(buffer));
            
            if (text) {
              textContent += `\n\n--- Content of attached file: ${file.name} ---\n${text}\n--- End of ${file.name} ---`;
            }
            
            if (imageUrls.length > 0) {
              hasImage = true;
              imageUrls.forEach(url => imageContent.push({ type: 'image_url', image_url: { url } }));
            }
          } catch (e) {
            console.error(`Failed to process PPTX file ${file.name}`, e);
            textContent += `\n\n[System note: Failed to read PPTX file ${file.name}]`;
          }
        }
        else if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
          try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            let content = '';
            const maxRowsPerSheet = 1000;
            
            workbook.SheetNames.forEach(sheetName => {
              content += `Sheet: ${sheetName}\n\n`;
              const worksheet = workbook.Sheets[sheetName];
              const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
              
              if (jsonData.length > maxRowsPerSheet) {
                const truncatedData = jsonData.slice(0, maxRowsPerSheet);
                const tempSheet = XLSX.utils.aoa_to_sheet(truncatedData);
                const sheetData = XLSX.utils.sheet_to_csv(tempSheet);
                content += sheetData + `\n\n[... Showing first ${maxRowsPerSheet} rows out of ${jsonData.length} total rows]\n\n`;
              } else {
                const sheetData = XLSX.utils.sheet_to_csv(worksheet);
                content += sheetData + '\n\n';
              }
            });
            
            if (content) {
              const { content: finalContent, wasTruncated } = truncateContent(content, 15000);
              textContent += `\n\n--- Content of attached file: ${file.name} ---\n${finalContent}\n--- End of ${file.name} ---`;
              
              if (wasTruncated) {
                textContent += `\n[Note: File content was truncated due to size]`;
              }
            }
          } catch (e) {
            console.error(`Failed to process XLSX file ${file.name}`, e);
            textContent += `\n\n[System note: Failed to read Excel file ${file.name}]`;
          }
        }
        else if (isTextBased(file) && file.size < 1000000) { 
          const fileText = await file.text();
          textContent += `\n\n--- Content of attached file: ${file.name} ---\n${fileText}\n--- End of ${file.name} ---`;
        }
      });
      await Promise.all(filePromises);
    }
    
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error('OpenRouter API key not configured');
      return NextResponse.json({ error: 'Service configuration error' }, { status: 500 });
    }
    
    let modelName = "";
    const visionModel = "qwen/qwen2.5-vl-72b-instruct:free";
    const dailyTaskModel = "openai/gpt-oss-20b:free";
    const codingTaskModel = "qwen/qwen-2.5-coder-32b-instruct:free";

    if (hasImage) {
      modelName = visionModel;
    } else if (taskType === 'daily') {
      modelName = dailyTaskModel;
    } else if (taskType === 'coding') {
      modelName = codingTaskModel;
    } else {
      const codingKeywords = ['code', 'python', 'javascript', 'error', 'debug', 'react', 'typescript', 'java', 'c++'];
      const isCodingRequest = codingKeywords.some(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        return regex.test(textContent);
      });
      modelName = isCodingRequest ? codingTaskModel : dailyTaskModel;
    }

    const apiUrl = "https://openrouter.ai/api/v1/chat/completions";

    const recentHistory = history.slice(-10);
    const formattedHistory = recentHistory.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.text
    }));

    const systemMessage = { role: "system", content: context || "You are AuraIQ, a helpful and intelligent AI assistant." };

    const userMessageContent = [];
    if (hasImage && !textContent.trim()) {
        userMessageContent.push({ type: 'text', text: 'Describe this image in detail.' });
    } else if (textContent.trim()) {
        const estimatedTokens = estimateTokens(textContent);
        const maxTokens = 25000;
        
        if (estimatedTokens > maxTokens) {
          console.warn(`Content too large (${estimatedTokens} tokens), truncating to ${maxTokens} tokens`);
          const { content: finalText } = truncateContent(textContent, maxTokens);
          textContent = finalText;
        }
        
        userMessageContent.push({ type: 'text', text: textContent });
    }

    if (imageContent.length > 0) {
        userMessageContent.push(...imageContent);
    }
    
    if (userMessageContent.length === 0) {
        return NextResponse.json({ error: "Input is empty." }, { status: 400 });
    }

    const payload = {
      model: modelName,
      messages: [
        systemMessage,
        ...formattedHistory,
        { role: "user", content: userMessageContent }
      ],
      stream: true
    };

    const upstream = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://auraiq-app.vercel.app", 
        "X-Title": "AuraIQ"
      },
      body: JSON.stringify(payload)
    });

    if (!upstream.ok || !upstream.body) {
        const errorBody = await upstream.text();
        console.error("OpenRouter API Error:", errorBody);
        return NextResponse.json({ error: 'AI service temporarily unavailable' }, { status: 503 });
    }
    
    const stream = new ReadableStream({
        async start(controller) {
          const reader = upstream.body!.getReader();
          
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                controller.close();
                break;
              }
              
              try {
                controller.enqueue(value);
              } catch (enqueueError) {
                console.error("Error enqueueing chunk:", enqueueError);
                break;
              }
            }
          } catch (err) {
            console.error("Error while reading upstream stream:", err);
            try {
              controller.error(err);
            } catch (controllerError) {
              console.error("Controller error:", controllerError);
            }
          } finally {
            try {
              reader.releaseLock();
            } catch (e) {
              // Ignore if already released
            }
          }
        }
      });
  
      return new Response(stream, {
        headers: { 
          "Content-Type": "text/event-stream; charset=utf-8",
          "X-RateLimit-Limit": RATE_LIMIT.requests.toString(),
          "X-RateLimit-Remaining": rateCheck.remaining.toString(),
        }
      });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Error in /api/chat:", errorMessage, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}