import { NextRequest, NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';
import { adminAuth } from '@/lib/firebase-admin';

// Store valid upload tokens temporarily (in production, use Redis or similar)
const uploadTokens = new Map<string, { userId: string; expiresAt: number }>();

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Check if this is a token request or an upload request
        if (body.type === 'request-upload-token') {
            // Step 1: Client requesting an upload token
            const authToken = body.token;

            if (!authToken) {
                return NextResponse.json({ error: 'Unauthorized - No token provided' }, { status: 401 });
            }

            // Verify the Firebase auth token
            const decodedToken = await adminAuth.verifyIdToken(authToken);
            const userId = decodedToken.uid;

            // Generate a temporary upload token
            const uploadToken = `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            uploadTokens.set(uploadToken, {
                userId,
                expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
            });

            // Clean up expired tokens
            for (const [token, data] of uploadTokens.entries()) {
                if (data.expiresAt < Date.now()) {
                    uploadTokens.delete(token);
                }
            }

            return NextResponse.json({ uploadToken });
        } else {
            // Step 2: Actual file upload request from Vercel Blob client
            const jsonResponse = await handleUpload({
                body,
                request,
                onBeforeGenerateToken: async (pathname, clientPayload) => {
                    // Validate the upload token from clientPayload
                    let uploadToken: string | undefined;
                    if (clientPayload) {
                        try {
                            const payload = JSON.parse(clientPayload);
                            uploadToken = payload.uploadToken;
                        } catch (e) {
                            console.error('Failed to parse clientPayload:', e);
                        }
                    }

                    if (!uploadToken || !uploadTokens.has(uploadToken)) {
                        throw new Error('Invalid or expired upload token');
                    }

                    const tokenData = uploadTokens.get(uploadToken)!;

                    // Check expiration
                    if (tokenData.expiresAt < Date.now()) {
                        uploadTokens.delete(uploadToken);
                        throw new Error('Upload token expired');
                    }

                    // Delete token after use (one-time use)
                    uploadTokens.delete(uploadToken);

                    return {
                        allowedContentTypes: [
                            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                            'application/pdf',
                            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            'text/plain', 'text/csv', 'application/json',
                        ],
                        tokenPayload: JSON.stringify({ userId: tokenData.userId }),
                    };
                },
                onUploadCompleted: async ({ blob }) => {
                    console.log('✅ Upload completed:', blob.url);
                },
            });

            return NextResponse.json(jsonResponse);
        }
    } catch (error) {
        console.error('Upload URL generation error:', error);
        return NextResponse.json({
            error: (error as Error).message || 'Failed to generate upload URL'
        }, { status: 500 });
    }
}
