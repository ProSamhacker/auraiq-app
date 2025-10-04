import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; // ✅ Ensures it runs in Node.js, not Edge

export async function POST(req: NextRequest) {
  try {
    const { input, context } = await req.json();

    if (!input) {
      return NextResponse.json({ error: "Missing required 'input' parameter" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OpenRouter API key is not configured on the server.");
    }

    const apiUrl = "https://openrouter.ai/api/v1/chat/completions";

    const payload = {
      model: "meta-llama/llama-3.3-70b-instruct",
      messages: [
        { role: "system", content: context || "You are AuraIQ, a helpful and intelligent AI assistant." },
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
        const decoder = new TextDecoder();

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
