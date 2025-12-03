import { NextRequest, NextResponse } from 'next/server';
import { uploadTranscriptPdfToDrive } from '@/lib/google-drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const chatName =
      (body &&
        typeof body === 'object' &&
        'chatName' in body &&
        typeof (body as any).chatName === 'string' &&
        (body as any).chatName.trim()) ||
      'test_chat_001';

    const baseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
    const pdfUrl = `${baseUrl}/api/conversations/${encodeURIComponent(chatName)}/pdf`;

    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to fetch PDF: ${pdfRes.status} ${pdfRes.statusText}`,
          pdfUrl,
        },
        { status: 500 },
      );
    }

    const arrayBuffer = await pdfRes.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    const driveResult = await uploadTranscriptPdfToDrive({
      chatName,
      pdfBuffer,
    });

    return NextResponse.json(
      {
        ok: true,
        chatName,
        pdfUrl,
        drive: driveResult,
      },
      { status: 200 },
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: String(error?.message ?? error ?? 'Unknown error'),
      },
      { status: 500 },
    );
  }
}
