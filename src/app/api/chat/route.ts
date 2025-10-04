import { NextRequest, NextResponse } from 'next/server';

// This server-side file has been updated to call the OpenRouter API.

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
            ]
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'http://localhost:3000', 
                'X-Title': 'AuraIQ',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
             const errorBody = await response.text();
             console.error("OpenRouter API Error:", errorBody);
             throw new Error(`OpenRouter API error: ${response.statusText}`);
        }

        const result = await response.json();
        const aiText = result.choices?.[0]?.message?.content;

        return NextResponse.json({ text: aiText || "No response text." });

    } catch (error) {
        // Changed `error: any` to `error` and casting to `Error` for type safety
        const errorMessage = (error instanceof Error) ? error.message : "An unknown error occurred";
        console.error("Error in /api/chat:", errorMessage);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}

