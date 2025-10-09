import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate the user
    const authToken = request.headers.get('Authorization')?.split('Bearer ')[1];
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decodedToken = await adminAuth.verifyIdToken(authToken);
    const userId = decodedToken.uid;

    // 2. Parse the file from the FormData
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    // 3. Upload the file to Vercel Blob
    const uniqueFilename = `${randomUUID()}-${file.name}`;
    const blob = await put(`context-files/${userId}/${uniqueFilename}`, file, {
      access: 'public',
    });

    // 4. Save the file metadata to Firestore
    const fileRef = adminDb.collection('users').doc(userId).collection('contextFiles').doc();
    await fileRef.set({
      name: file.name,
      url: blob.url,
      userId: userId,
      uploadedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, fileId: fileRef.id });

  } catch (error) {
    console.error('Context file upload error:', error);
    if ((error as Error).message.includes('token')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}