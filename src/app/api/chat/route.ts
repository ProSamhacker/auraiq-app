import { NextRequest, NextResponse } from 'next/server';

// This server-side file has been updated to call the OpenRouter API.

export async function POST(req: NextRequest) {
    try {
        const { input, context } = await req.json();

        if (!input) {
            return NextResponse.json({ error: "Missing required 'input' parameter" }, { status: 400 });
        }

        // 1. Safely get the OpenRouter API key from environment variables.
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            throw new Error("OpenRouter API key is not configured on the server.");
        }

        // 2. Define the API URL for OpenRouter.
        const apiUrl = "https://openrouter.ai/api/v1/chat/completions";

        // 3. Structure the payload according to OpenRouter's requirements.
        const payload = {
            model: "meta-llama/llama-3.3-70b-instruct", // The specific model you chose
            messages: [
                { role: "system", content: context || "You are AuraIQ, a helpful and intelligent AI assistant." },
                { role: "user", content: input }
            ]
        };

        // 4. Make the fetch request with the correct headers.
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                // OpenRouter requires a site URL and app name for identification
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
        // 5. Parse the response to get the AI's message.
        const aiText = result.choices?.[0]?.message?.content;

        return NextResponse.json({ text: aiText || "No response text." });

    } catch (error: any) {
        console.error("Error in /api/chat:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

