// src/app/api/cleanup-files/route.ts
// NOTE: This is a conceptual example. A full implementation would require
// storing file URLs and upload dates in your Firestore database.

import { NextResponse } from 'next/server';
import { list, del } from '@vercel/blob';

export async function GET() {
  // This logic would be more complex in a real app.
  // You would query your database for files older than 30 days.

  const { blobs } = await list();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const oldBlobs = blobs.filter(blob => new Date(blob.uploadedAt) < thirtyDaysAgo);
  const urlsToDelete = oldBlobs.map(blob => blob.url);

  if (urlsToDelete.length > 0) {
    await del(urlsToDelete);
    return NextResponse.json({ message: `Deleted ${urlsToDelete.length} old file(s).` });
  }

  return NextResponse.json({ message: "No old files to delete." });
}