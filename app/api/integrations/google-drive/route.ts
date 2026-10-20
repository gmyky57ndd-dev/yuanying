import { NextResponse } from 'next/server';
import {
  disconnectGoogleDrive,
  getGoogleDriveStatus,
} from '@/lib/google-drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getGoogleDriveStatus());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'status failed' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await disconnectGoogleDrive();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'disconnect failed' },
      { status: 500 }
    );
  }
}
