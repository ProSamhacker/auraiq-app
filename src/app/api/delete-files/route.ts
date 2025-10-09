// src/app/api/delete-files/route.ts

import { del } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // In a real app, you would add authentication here to ensure
  // a user can only delete their own files.

  const { urls } = await request.json();

  if (!urls || !Array.isArray(urls)) {
    return NextResponse.json({ error: 'URLs must be an array.' }, { status: 400 });
  }

  try {
    await del(urls);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting files from Vercel Blob:", error);
    return NextResponse.json({ error: 'Failed to delete files.' }, { status: 500 });
  }
}