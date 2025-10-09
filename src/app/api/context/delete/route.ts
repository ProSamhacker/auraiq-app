import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate the user
    const authToken = request.headers.get('Authorization')?.split('Bearer ')[1];
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decodedToken = await adminAuth.verifyIdToken(authToken);
    const userId = decodedToken.uid;

    // 2. Get the file ID from the request body
    const { fileId } = await request.json();
    if (!fileId) {
      return NextResponse.json({ error: 'File ID is required.' }, { status: 400 });
    }

    // 3. Get the file document from Firestore to verify ownership and get URL
    const fileRef = adminDb.collection('users').doc(userId).collection('contextFiles').doc(fileId);
    const doc = await fileRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    }

    const fileData = doc.data();
    if (!fileData || fileData.userId !== userId) {
      return NextResponse.json({ error: 'Permission denied.' }, { status: 403 });
    }

    // 4. Delete the file from Vercel Blob
    await del(fileData.url);

    // 5. Delete the file record from Firestore
    await fileRef.delete();

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Context file delete error:', error);
    if ((error as Error).message.includes('token')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}