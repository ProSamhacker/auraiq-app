// src/app/api/cron/cleanup-blobs/route.ts
// This endpoint should be called by Vercel Cron Jobs or similar service

import { NextRequest, NextResponse } from 'next/server';
import { list, del } from '@vercel/blob';
import { adminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * This endpoint cleans up orphaned blob files that are not referenced in Firestore
 * Should be run daily via cron job
 */
export async function GET(request: NextRequest) {
  try {
    // Verify this is being called by Vercel Cron or authorized source
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Blob Cleanup] Starting cleanup job...');

    // 1. Get all blobs from storage
    const { blobs } = await list();
    console.log(`[Blob Cleanup] Found ${blobs.length} blobs in storage`);

    // 2. Get all blob URLs referenced in Firestore
    const referencedUrls = new Set<string>();

    // Get all users
    const usersSnapshot = await adminDb.collection('users').get();
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      // Get context files
      const contextFilesSnapshot = await adminDb
        .collection('users')
        .doc(userId)
        .collection('contextFiles')
        .get();

      contextFilesSnapshot.forEach(doc => {
        const url = doc.data().url;
        if (url) referencedUrls.add(url);
      });

      // Get chat messages
      const chatsSnapshot = await adminDb
        .collection('users')
        .doc(userId)
        .collection('chats')
        .get();

      for (const chatDoc of chatsSnapshot.docs) {
        const messages = chatDoc.data().messages || [];
        
        // Extract URLs from message text
        messages.forEach((msg: any) => {
          const urlRegex = /https:\/\/[\w.-]+\.public\.blob\.vercel-storage\.com\/[^\s\])]+/g;
          const matches = msg.text?.match(urlRegex);
          if (matches) {
            matches.forEach((url: string) => referencedUrls.add(url));
          }
        });
      }
    }

    console.log(`[Blob Cleanup] Found ${referencedUrls.size} referenced URLs`);

    // 3. Find orphaned blobs (not referenced and older than 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const orphanedBlobs = blobs.filter(blob => {
      const isOrphaned = !referencedUrls.has(blob.url);
      const isOld = new Date(blob.uploadedAt) < sevenDaysAgo;
      return isOrphaned && isOld;
    });

    console.log(`[Blob Cleanup] Found ${orphanedBlobs.length} orphaned blobs to delete`);

    // 4. Delete orphaned blobs in batches
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

// vercel.json - Configure cron job
/*
{
  "crons": [
    {
      "path": "/api/cron/cleanup-blobs",
      "schedule": "0 2 * * *"
    }
  ]
}
*/

// Add to .env
/*
CRON_SECRET=your_random_secret_string_here
*/