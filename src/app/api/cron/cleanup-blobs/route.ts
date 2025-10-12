// src/app/api/cron/cleanup-blobs/route.ts - FIXED VERSION

import { NextRequest, NextResponse } from 'next/server';
import { list, del } from '@vercel/blob';
import { adminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MessageData {
  text?: string;
  sender?: string;
  timestamp?: number;
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Blob Cleanup] Starting cleanup job...');

    const { blobs } = await list();
    console.log(`[Blob Cleanup] Found ${blobs.length} blobs in storage`);

    const referencedUrls = new Set<string>();

    const usersSnapshot = await adminDb.collection('users').get();
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      const contextFilesSnapshot = await adminDb
        .collection('users')
        .doc(userId)
        .collection('contextFiles')
        .get();

      contextFilesSnapshot.forEach(doc => {
        const url = doc.data().url;
        if (url) referencedUrls.add(url);
      });

      const chatsSnapshot = await adminDb
        .collection('users')
        .doc(userId)
        .collection('chats')
        .get();

      for (const chatDoc of chatsSnapshot.docs) {
        const messagesSnapshot = await adminDb
          .collection('users')
          .doc(userId)
          .collection('chats')
          .doc(chatDoc.id)
          .collection('messages')
          .get();
        
        messagesSnapshot.forEach(msgDoc => {
          const msg = msgDoc.data() as MessageData;
          const urlRegex = /https:\/\/[\w.-]+\.public\.blob\.vercel-storage\.com\/[^\s\])]+/g;
          const matches = msg.text?.match(urlRegex);
          if (matches) {
            matches.forEach(url => referencedUrls.add(url));
          }
        });
      }
    }

    console.log(`[Blob Cleanup] Found ${referencedUrls.size} referenced URLs`);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const orphanedBlobs = blobs.filter(blob => {
      const isOrphaned = !referencedUrls.has(blob.url);
      const isOld = new Date(blob.uploadedAt) < sevenDaysAgo;
      return isOrphaned && isOld;
    });

    console.log(`[Blob Cleanup] Found ${orphanedBlobs.length} orphaned blobs to delete`);

    if (orphanedBlobs.length > 0) {
      const batchSize = 50;
      let deletedCount = 0;

      for (let i = 0; i < orphanedBlobs.length; i += batchSize) {
        const batch = orphanedBlobs.slice(i, i + batchSize);
        const urlsToDelete = batch.map(blob => blob.url);

        try {
          await del(urlsToDelete);
          deletedCount += urlsToDelete.length;
          console.log(`[Blob Cleanup] Deleted batch ${Math.floor(i / batchSize) + 1}`);
        } catch (error) {
          console.error('[Blob Cleanup] Error deleting batch:', error);
        }
      }

      console.log(`[Blob Cleanup] Successfully deleted ${deletedCount} orphaned blobs`);

      return NextResponse.json({
        success: true,
        message: `Deleted ${deletedCount} orphaned files`,
        details: {
          totalBlobs: blobs.length,
          referencedBlobs: referencedUrls.size,
          orphanedBlobs: orphanedBlobs.length,
          deletedBlobs: deletedCount,
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: 'No orphaned files found',
      details: {
        totalBlobs: blobs.length,
        referencedBlobs: referencedUrls.size,
        orphanedBlobs: 0,
      }
    });

  } catch (error) {
    console.error('[Blob Cleanup] Error:', error);
    return NextResponse.json(
      { error: 'Cleanup job failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}