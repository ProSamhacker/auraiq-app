// src/app/api/chat/route.ts

import { NextRequest, NextResponse } from "next/server";
import { put } from '@vercel/blob';
import { randomUUID } from "crypto";

export const runtime = "nodejs";

type HistoryMessage = {
  id: string;
  text: string;
  sender: 'user' | 'ai';
};

const isTextBased = (file: File): boolean => {
  const textMimeTypes = ['text/', 'application/json', 'application/javascript', 'application/xml', 'application/x-python-script', 'application/typescript'];
  return textMimeTypes.some(type => file.type.startsWith(type) || file.type === 'application/octet-stream');
}

const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const input = formData.get('input') as string;
    const taskType = formData.get('taskType') as string;
    const context = formData.get('context') as string;
    const historyString = formData.get('history') as string;
    const history = JSON.parse(historyString || '[]') as HistoryMessage[];
    const files = formData.getAll('files') as File[];
    const contextFileUrlsString = formData.get('contextFileUrls') as string;
    
    let textContent = input;
    const imageContent: { type: 'image_url'; image_url: { url: string } }[] = [];
    let hasImage = false;

    // vvvvvvvvvv THIS ENTIRE BLOCK HAS BEEN UPDATED vvvvvvvvvv
    if (contextFileUrlsString) {
      const contextFileUrls = JSON.parse(contextFileUrlsString) as string[];
      if (contextFileUrls.length > 0) {
        const fileContentPromises = contextFileUrls.map(async (url) => {
          try {
            const fileName = decodeURIComponent(url.split('/').pop() || 'context file');
            const response = await fetch(url);

            if (response.ok) {
              const contentType = response.headers.get('content-type');
              // Check if the context file is an image
              if (contentType && contentType.startsWith('image/')) {
                hasImage = true;
                imageContent.push({ type: 'image_url', image_url: { url: url } });
              } else {
                // Otherwise, treat it as a text file
                const fileText = await response.text();
                textContent += `\n\n--- Content from context file: ${fileName} ---\n${fileText}\n--- End of ${fileName} ---`;
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
    // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

    if (files.length > 0) {
      const filePromises = files.map(async (file) => {
        if (file.type.startsWith('image/')) {
          hasImage = true;
          const uniqueFilename = `${randomUUID()}-${file.name}`;
          const blob = await put(uniqueFilename, file, { access: 'public' });
          imageContent.push({ type: 'image_url', image_url: { url: blob.url } });
        } else if (isTextBased(file) && file.size < 1000000) { 
          const fileText = await file.text();
          textContent += `\n\n--- Content of attached file: ${file.name} ---\n${fileText}\n--- End of ${file.name} ---`;
        }
      });
      await Promise.all(filePromises);
    }
    
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OpenRouter API key is not configured.");
    
    let modelName = "";
    const visionModel = "qwen/qwen2.5-vl-72b-instruct:free";
    const dailyTaskModel = "meta-llama/llama-3.3-70b-instruct:free";
    const codingTaskModel = "qwen/qwen-2.5-coder-32b-instruct:free";

    if (hasImage) {
      modelName = visionModel;
    } else if (taskType === 'daily') {
      modelName = dailyTaskModel;
    } else if (taskType === 'coding') {
      modelName = codingTaskModel;
    } else {
      const codingKeywords = ['code', 'python', 'javascript', 'error', 'debug', 'react', 'typescript', 'java', 'c++'];
      const isCodingRequest = codingKeywords.some(keyword => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(textContent));
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
        return NextResponse.json({ error: `OpenRouter API error: ${errorBody}` }, { status: upstream.status });
    }
    
    const stream = new ReadableStream({
        async start(controller) {
          const reader = upstream.body!.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch (err) {
            console.error("Error while reading upstream stream:", err);
          } finally {
            controller.close();
          }
        }
      });
  
      return new Response(stream, {
        headers: { "Content-Type": "text-event-stream; charset=utf-8" }
      });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Error in /api/chat:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}