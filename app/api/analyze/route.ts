import { NextRequest, NextResponse } from 'next/server';

// ── pdf-parse import ──────────────────────────────────────────────────────────
// DO NOT use `import pdfParse from 'pdf-parse'`.
//
// With tsconfig `module: 'esnext'` + `moduleResolution: 'bundler'`, TypeScript
// emits a native ESM import. Webpack's CJS interop for external packages can
// resolve the default binding to `undefined` instead of the exported function
// because pdf-parse uses `module.exports = fn` with no `.default` property.
// Calling `undefined(buffer)` throws TypeError synchronously → the async
// wrapper returns an immediately-rejected Promise → catch fires in ~0ms →
// regex also finds nothing → "All extraction methods failed [+2ms]".
//
// `require()` bypasses all ESM interop and gets the function directly.
const pdfParse: (buf: Buffer | Uint8Array, opts?: object) => Promise<{ text: string }> =
  // require() instead of ESM import — avoids CJS/ESM interop where the default
  // binding resolves to undefined and pdfParse(buffer) throws synchronously.
  // eslint-disable-next-line
  require('pdf-parse');

export const runtime = 'nodejs';
export const maxDuration = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

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

// Scans raw PDF bytes for uncompressed BT/ET text blocks.
// Returns '' for FlateDecode-compressed PDFs — that's expected, not a bug.
// Synchronous, zero I/O, cannot hang.
function extractWithRegex(buffer: Buffer): string {
  const str = buffer.toString('latin1');
  const parts: string[] = [];
  const btEtRe = /BT([\s\S]*?)ET/g;
  let m: RegExpExecArray | null;
  while ((m = btEtRe.exec(str)) !== null) {
    const block = m[1];
    const tjRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g;
    let t: RegExpExecArray | null;
    while ((t = tjRe.exec(block)) !== null) parts.push(decodePDFStr(t[1]));
    const tjArrRe = /\[([^\]]*)\]\s*TJ/g;
    while ((t = tjArrRe.exec(block)) !== null) {
      const strRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
      let s: RegExpExecArray | null;
      while ((s = strRe.exec(t[1])) !== null) parts.push(decodePDFStr(s[1]));
    }
    parts.push('\n');
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// ── POST Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const start = Date.now();

  try {
    // ── 1. File ────────────────────────────────────────────────────────────────
    const formData = await req.formData();
    const file = (formData.get('file') || formData.get('resume')) as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    console.log(`📥 Received file: "${file.name}" — buffer length: ${buffer.length} bytes`);

    // ── 2. PDF signature check ─────────────────────────────────────────────────
    const header = buffer.slice(0, 8).toString('ascii');
    console.log(`🔍 Header bytes: ${JSON.stringify(header)}`);

    if (!header.startsWith('%PDF')) {
      console.warn('⚠️  Rejected: missing %PDF header');
      return NextResponse.json(
        { error: 'Not a valid PDF. Export your resume as a PDF and try again.' },
        { status: 422 }
      );
    }

    // ── 3. Guard: confirm pdfParse is callable ─────────────────────────────────
    // If require('pdf-parse') returned something unexpected, fail loudly here
    // rather than silently in the catch block two steps later.
    if (typeof pdfParse !== 'function') {
      console.error('❌ pdfParse is not a function — got:', typeof pdfParse);
      return NextResponse.json({ error: 'PDF parser unavailable.' }, { status: 500 });
    }

    // ── 4. Extract text ────────────────────────────────────────────────────────
    let resumeText: string | null = null;

    // ── Primary: pdf-parse ─────────────────────────────────────────────────────
    // Pass a Uint8Array, not a raw Buffer.
    // pdfjs v1.10.100 (bundled inside pdf-parse) uses `isArrayBuffer(v)` which
    // checks `v.buffer instanceof ArrayBuffer`. Node.js Buffer inherits this, but
    // in some bundled environments the prototype chain is interrupted and the
    // check fails — pdfjs then tries to treat the Buffer as a params object,
    // calls getDocument({}) and throws immediately. Uint8Array is unambiguous.
    console.log(`⏳ pdf-parse started — passing ${buffer.length}-byte Uint8Array`);

    try {
      const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const pdfData = await withTimeout(pdfParse(uint8), 5000, 'pdf-parse');
      const text = (pdfData.text ?? '').trim();

      console.log(`📄 pdf-parse result length: ${text.length} chars`);

      if (text.length >= 20) {
        resumeText = text;
        console.log(`✅ pdf-parse success [+${Date.now() - start}ms]`);
      } else {
        console.warn(`⚠️  pdf-parse returned ${text.length} chars — below 20-char threshold`);
      }
    } catch (e: any) {
      const msg: string = e?.message ?? String(e);
      console.warn(`⚠️  pdf-parse failed: "${msg}" [+${Date.now() - start}ms]`);

      if (/decrypt|password/i.test(msg)) {
        return NextResponse.json(
          { error: 'PDF is password-protected. Remove the password and try again.' },
          { status: 422 }
        );
      }
    }

    // ── Fallback: BT/ET regex ──────────────────────────────────────────────────
    if (!resumeText) {
      console.warn(`⚠️  Fallback triggered — running regex scan`);
      try {
        const text = extractWithRegex(buffer);
        console.log(`📄 Regex fallback result length: ${text.length} chars`);
        if (text.length >= 20) {
          resumeText = text;
          console.log(`✅ Regex fallback used [+${Date.now() - start}ms]`);
        } else {
          console.warn(`⚠️  Regex fallback returned ${text.length} chars — not enough`);
        }
      } catch (e: any) {
        console.warn(`⚠️  Regex fallback threw: ${e?.message ?? e}`);
      }
    }

    // ── 5. Final check ─────────────────────────────────────────────────────────
    if (!resumeText) {
      console.error(`❌ All extraction methods failed — final text length: 0 [+${Date.now() - start}ms]`);
      return NextResponse.json(
        { error: 'Could not read text from your PDF. Try re-exporting from Word, Google Docs, or Overleaf.' },
        { status: 422 }
      );
    }

    console.log(`📄 Final text length: ${resumeText.length} chars [+${Date.now() - start}ms]`);

    // AI call disabled — returning raw extraction for stability verification.
    // TODO: re-add Groq call here once Vercel logs confirm consistent extraction.
    return NextResponse.json({
      ok: true,
      chars: resumeText.length,
      elapsed_ms: Date.now() - start,
      text: resumeText.slice(0, 500),
    });

  } catch (e: any) {
    console.error('❌ Unhandled error in /api/analyze:', e?.message ?? e);
    return NextResponse.json(
      { error: 'Unexpected server error. Please try again.' },
      { status: 500 }
    );
  }
}
