// src/app/api/chat/route.ts

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type HistoryMessage = {
  id: string;
  text: string;
  sender: 'user' | 'ai';
};

export async function POST(req: NextRequest) {
  try {
    const { input, context, history } = await req.json();

    if (!input) {
      return NextResponse.json({ error: "Missing required 'input' parameter" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OpenRouter API key is not configured on the server.");
    }

    const apiUrl = "https://openrouter.ai/api/v1/chat/completions";

    const formattedHistory = (history as HistoryMessage[] || []).map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.text
    }));

    const systemMessage = {
      role: "system",
      content: (context || "You are AuraIQ, a helpful and intelligent AI assistant.") + " Always format your responses using Markdown. Use lists, bold text, and code blocks when appropriate."
    };

    const payload = {
      model: "deepseek/deepseek-chat-v3.1:free",
      messages: [
        systemMessage,
        ...formattedHistory,
        { role: "user", content: input }
      ],
      stream: true
    };

    const upstream = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://auraiq-app.vercel.app",
        "X-Title": "AuraIQ"
      },
      body: JSON.stringify(payload)
    });

    if (!upstream.ok || !upstream.body) {
      const errorBody = await upstream.text();
      console.error("OpenRouter API Error:", errorBody);
      return NextResponse.json({ error: `OpenRouter API error: ${upstream.statusText}` }, { status: 502 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        // MODIFICATION: Removed the unused 'decoder' variable
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
          try {
            reader.releaseLock();
          } catch {
            /* ignore */
          }
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Error in /api/chat:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}