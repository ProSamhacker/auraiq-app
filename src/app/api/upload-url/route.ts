import { NextRequest, NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';
import { adminAuth } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
    try {
        // 1. Parse the request body to get clientPayload with auth token
        const body = await request.json();

        // Extract token from clientPayload
        let authToken: string | undefined;
        if (body.clientPayload) {
            try {
                const payload = JSON.parse(body.clientPayload);
                authToken = payload.token;
            } catch (e) {
                console.error('Failed to parse clientPayload:', e);
            }
        }

        if (!authToken) {
            return NextResponse.json({ error: 'Unauthorized - No token provided' }, { status: 401 });
        }

        // 2. Verify the Firebase auth token
        const decodedToken = await adminAuth.verifyIdToken(authToken);
        const userId = decodedToken.uid;

        // 3. Handle the upload request to generate presigned URL
        const jsonResponse = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async (pathname) => {
                // Validate file types and set permissions
                return {
                    allowedContentTypes: [
                        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                        'application/pdf',
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        'text/plain', 'text/csv', 'application/json',
                    ],
                    tokenPayload: JSON.stringify({ userId }),
                };
            },
            onUploadCompleted: async ({ blob }) => {
                console.log('✅ Upload completed:', blob.url);
            },
        });

        return NextResponse.json(jsonResponse);
    } catch (error) {
        console.error('Upload URL generation error:', error);
        if ((error as Error).message.includes('token') || (error as Error).message.includes('auth')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
    }
}
