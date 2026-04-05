import { NextRequest, NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

// Node.js runtime required — pdf-parse uses Buffer and fs APIs unavailable on Edge.
export const runtime = 'nodejs';

// Vercel Hobby hard ceiling is 10s. Extraction alone should finish well inside 5s.
export const maxDuration = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Race a promise against a hard deadline.
 * The original promise is left to GC on timeout — fine for serverless.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Decode PDF string escape sequences into readable text.
 * Used by the regex fallback when reading raw BT/ET content streams.
 */
function decodePDFStr(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

/**
 * Regex fallback: scans raw PDF bytes for BT/ET text blocks.
 * Only recovers text from uncompressed content streams (FlateDecode PDFs return '').
 * Zero dependencies, cannot hang, never throws — safe as a last resort.
 */
function extractWithRegex(buffer: Buffer): string {
  const str = buffer.toString('latin1');
  const parts: string[] = [];
  const btEtRe = /BT([\s\S]*?)ET/g;
  let m: RegExpExecArray | null;

  while ((m = btEtRe.exec(str)) !== null) {
    const block = m[1];

    // Tj operator — single string literal: (text) Tj
    const tjRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g;
    let t: RegExpExecArray | null;
    while ((t = tjRe.exec(block)) !== null) {
      parts.push(decodePDFStr(t[1]));
    }

    // TJ operator — array with kerning offsets: [(text) offset (text)] TJ
    const tjArrRe = /\[([^\]]*)\]\s*TJ/g;
    while ((t = tjArrRe.exec(block)) !== null) {
      const strRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
      let s: RegExpExecArray | null;
      while ((s = strRe.exec(t[1])) !== null) {
        parts.push(decodePDFStr(s[1]));
      }
    }

    parts.push('\n');
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// ── POST Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const start = Date.now();

  try {
    // ── 1. Read file ──────────────────────────────────────────────────────────
    const formData = await req.formData();
    const file = (formData.get('file') || formData.get('resume')) as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    console.log(`📥 Received file: "${file.name}" — ${buffer.length} bytes`);

    // ── 2. Validate PDF signature ─────────────────────────────────────────────
    // Every valid PDF begins with %PDF. Catch renamed .doc files, empty uploads,
    // and truncated transfers before handing them to the parser.
    const header = buffer.slice(0, 5).toString('ascii');
    if (!header.startsWith('%PDF')) {
      console.warn('⚠️  Rejected: missing %PDF header');
      return NextResponse.json(
        { error: 'The file is not a valid PDF. Export your resume as a PDF and try again.' },
        { status: 422 }
      );
    }

    // ── 3. Extract text ───────────────────────────────────────────────────────
    let resumeText: string | null = null;

    // ── Primary: pdf-parse ────────────────────────────────────────────────────
    // Handles the vast majority of PDFs. Wrapped in a 4s timeout so a hung
    // parser never burns the entire 10s Vercel budget.
    try {
      const pdfData = await withTimeout(pdfParse(buffer), 4000, 'pdf-parse');
      const text = pdfData.text.trim();

      if (text.length >= 20) {
        resumeText = text;
        console.log(`✅ pdf-parse success — ${text.length} chars [+${Date.now() - start}ms]`);
      } else {
        console.warn(`⚠️  pdf-parse returned only ${text.length} chars — below 20-char threshold`);
      }
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      console.warn(`⚠️  pdf-parse failed: ${msg}`);

      // Password-protected PDFs cannot be recovered by any fallback — reject early.
      if (/decrypt|password/i.test(msg)) {
        return NextResponse.json(
          { error: 'PDF is password-protected. Remove the password and try again.' },
          { status: 422 }
        );
      }
    }

    // ── Fallback: BT/ET regex scan ────────────────────────────────────────────
    // Only attempted when pdf-parse produced nothing. Cannot hang — synchronous,
    // zero I/O. Returns '' on FlateDecode-compressed PDFs (acceptable: the real
    // failure already happened above and will be reported to the user).
    if (!resumeText) {
      console.warn('⚠️  Attempting regex fallback...');
      try {
        const text = extractWithRegex(buffer);

        if (text.length >= 20) {
          resumeText = text;
          console.log(`✅ Regex fallback used — ${text.length} chars [+${Date.now() - start}ms]`);
        } else {
          console.warn(`⚠️  Regex fallback returned only ${text.length} chars — not enough`);
        }
      } catch (e: any) {
        console.warn(`⚠️  Regex fallback threw: ${e?.message ?? e}`);
      }
    }

    // ── 4. Check result ───────────────────────────────────────────────────────
    if (!resumeText) {
      console.error(`❌ All extraction methods failed [+${Date.now() - start}ms]`);
      return NextResponse.json(
        { error: 'Could not read text from your PDF. Try re-exporting from Word, Google Docs, or Overleaf — this usually fixes it.' },
        { status: 422 }
      );
    }

    console.log(`📄 Final text length: ${resumeText.length} chars [+${Date.now() - start}ms]`);

    // ── 5. Return extracted text ──────────────────────────────────────────────
    // AI analysis is intentionally disabled here.
    // This endpoint now returns raw extraction only — used to confirm the
    // extraction pipeline is stable on Vercel before the Groq call is re-added.
    // TODO: replace this response with the Groq analysis call once stable.
    return NextResponse.json({
      ok: true,
      chars: resumeText.length,
      elapsed_ms: Date.now() - start,
      text: resumeText.slice(0, 500), // preview — remove slice when adding AI
    });

  } catch (e: any) {
    // Top-level catch — should never fire, but guarantees we always send a response.
    console.error('❌ Unhandled error in /api/analyze:', e?.message ?? e);
    return NextResponse.json(
      { error: 'Unexpected server error. Please try again.' },
      { status: 500 }
    );
  }
}
