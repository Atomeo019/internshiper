import { NextRequest, NextResponse } from 'next/server';
import type { ExtractionResponse, AnalysisResponse, ErrorResponse } from '@/lib/types';
import { normalizeAnalysisResult } from '@/lib/normalize';

// ── Feature flag ──────────────────────────────────────────────────────────────
// false  → extraction-only (verify PDF parsing without burning Groq tokens)
// true   → full AI analysis (requires GROQ_API_KEY in environment)
const AI_ENABLED = true;

const AI_CHAR_LIMIT  = 6000;  // chars sent to AI — Groq context + cost ceiling
const PREVIEW_CHARS  = 500;   // chars in preview_text field
const GROQ_TIMEOUT   = 8000;  // ms — leave headroom under Vercel's 10s maxDuration

// ── AI prompt ─────────────────────────────────────────────────────────────────
// Constraints are explicit so the model cannot guess field names or enum values.
// temperature: 0.1 + json_object mode makes hallucinated structure extremely rare.
// normalizeAnalysisResult is the safety net if the model still drifts.
const GROQ_SYSTEM_PROMPT = `You are an expert resume analyst evaluating resumes for competitive tech internship programs.

Analyze the provided resume text and return a single JSON object. No markdown, no explanation, no code fences — raw JSON only.

SCORING RUBRIC
content_score (0–100):
  - Skills relevance to CS/SWE internships: 30 pts
  - Project quality and demonstrated impact: 30 pts
  - Work experience relevance: 20 pts
  - Resume completeness and clarity: 20 pts

ats_score (0–100):
  - Clean, standard formatting (no tables/columns): 25 pts
  - Keyword density for CS roles: 25 pts
  - Standard section headings present: 25 pts
  - No parsing blockers (images, graphics, headers/footers): 25 pts

profile_strength thresholds: Strong ≥ 80, Good 65–79, Average 45–64, Weak 0–44

REQUIRED JSON SCHEMA — every field is required:
{
  "content_score": integer 0–100,
  "ats_score": integer 0–100,
  "has_metrics": boolean (true if any bullet point contains a number/percentage/dollar amount),
  "profile_strength": "Weak" | "Average" | "Good" | "Strong",
  "summary": string (2–3 sentences, direct recruiter verdict — no generic praise),
  "strengths": string[] (3–5 specific genuine strengths with evidence from the resume),
  "issues": string[] (3–5 specific, actionable problems — not vague),
  "red_flags": string[] (things that cause immediate rejection or credibility loss — empty array if none),
  "action_plan": string[] (exactly 5 prioritized improvement steps, most impactful first),
  "skills_analysis": {
    "strong_skills": string[] (skills backed by project/work evidence),
    "weak_skills": string[] (skills listed in skills section but not demonstrated anywhere),
    "missing_skills": string[] (important CS internship skills absent from resume)
  },
  "project_analysis": string (2–3 sentences on project complexity, impact, and stack — be specific),
  "experience_analysis": string (2–3 sentences on work experience depth and relevance — be specific),
  "ats_breakdown": {
    "parsing_risk": "None" | "Low" | "Medium" | "High" | "Critical",
    "keyword_density": "None" | "Low" | "Adequate" | "Strong",
    "formatting_issues": string[] (specific formatting problems — empty array if none),
    "missing_keywords": string[] (important tech keywords missing for CS roles),
    "ats_verdict": string (one sentence — will this resume survive automated filtering?)
  },
  "upgrade_insight": {
    "action": string (single highest-impact action the candidate can take this week),
    "expected_score_increase": integer 1–20,
    "reason": string (why this specific action matters most for this specific resume)
  },
  "competitive_position": string (1–2 sentences on where this candidate sits vs top-25% CS internship applicants)
}

Be direct and specific. Generic feedback like "improve your projects" is worthless. Reference what you actually see in the resume.`;

// ── pdf-parse import ──────────────────────────────────────────────────────────
// DO NOT use `import pdfParse from 'pdf-parse'`.
// With tsconfig `module: 'esnext'` + `moduleResolution: 'bundler'`, TypeScript
// emits a native ESM import. Webpack's CJS interop for external packages can
// resolve the default binding to `undefined` instead of the exported function
// because pdf-parse uses `module.exports = fn` with no `.default` property.
// Calling `undefined(buffer)` throws TypeError synchronously → the async
// wrapper returns an immediately-rejected Promise → catch fires in ~0ms →
// regex also finds nothing → "All extraction methods failed [+2ms]".
// `require()` bypasses all ESM interop and gets the function directly.
const pdfParse: (buf: Buffer | Uint8Array, opts?: object) => Promise<{ text: string }> =
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

// ── Groq API call ─────────────────────────────────────────────────────────────
// Returns the raw parsed JSON object — caller must pass it through
// normalizeAnalysisResult before using it.
// Throws on network failure, non-200 response, or unparseable JSON.
async function callGroq(resumeText: string): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const response = await withTimeout(
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: GROQ_SYSTEM_PROMPT },
          { role: 'user', content: `RESUME TEXT:\n\n${resumeText}` },
        ],
      }),
    }),
    GROQ_TIMEOUT,
    'Groq API'
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Groq returned ${response.status}: ${errText.slice(0, 200)}`);
  }

  const groqJson = await response.json();
  const content: string = groqJson?.choices?.[0]?.message?.content ?? '';

  if (!content) throw new Error('Groq returned empty content');

  // response_format: json_object guarantees valid JSON, but we still wrap in
  // try/catch because the guarantee is model-level, not network-level.
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`Groq content was not valid JSON: ${content.slice(0, 200)}`);
  }
}

// ── POST Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const start = Date.now();

  try {
    // ── 1. File ────────────────────────────────────────────────────────────────
    const formData = await req.formData();
    const file = (formData.get('file') || formData.get('resume')) as File | null;

    if (!file) {
      const body: ErrorResponse = { ok: false, mode: 'error', error: 'No file uploaded.', code: 'NO_FILE' };
      return NextResponse.json(body, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    console.log(`📥 Received file: "${file.name}" — buffer length: ${buffer.length} bytes`);

    // ── 2. PDF signature check ─────────────────────────────────────────────────
    const header = buffer.slice(0, 8).toString('ascii');
    console.log(`🔍 Header bytes: ${JSON.stringify(header)}`);

    if (!header.startsWith('%PDF')) {
      console.warn('⚠️  Rejected: missing %PDF header');
      const body: ErrorResponse = {
        ok: false, mode: 'error',
        error: 'Not a valid PDF. Export your resume as a PDF and try again.',
        code: 'INVALID_PDF',
      };
      return NextResponse.json(body, { status: 422 });
    }

    // ── 3. Guard: confirm pdfParse is callable ─────────────────────────────────
    if (typeof pdfParse !== 'function') {
      console.error('❌ pdfParse is not a function — got:', typeof pdfParse);
      const body: ErrorResponse = { ok: false, mode: 'error', error: 'PDF parser unavailable.', code: 'PARSER_UNAVAILABLE' };
      return NextResponse.json(body, { status: 500 });
    }

    // ── 4. Extract text ────────────────────────────────────────────────────────
    let resumeText: string | null = null;

    // Primary: pdf-parse
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
        const body: ErrorResponse = {
          ok: false, mode: 'error',
          error: 'PDF is password-protected. Remove the password and try again.',
          code: 'PDF_ENCRYPTED',
        };
        return NextResponse.json(body, { status: 422 });
      }
    }

    // Fallback: BT/ET regex
    if (!resumeText) {
      console.warn('⚠️  Fallback triggered — running regex scan');
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

    // ── 5. Final extraction check ──────────────────────────────────────────────
    if (!resumeText) {
      console.error(`❌ All extraction methods failed [+${Date.now() - start}ms]`);
      const body: ErrorResponse = {
        ok: false, mode: 'error',
        error: 'Could not read text from your PDF. Try re-exporting from Word, Google Docs, or Overleaf.',
        code: 'PARSE_FAILED',
      };
      return NextResponse.json(body, { status: 422 });
    }

    console.log(`📄 Final text length: ${resumeText.length} chars [+${Date.now() - start}ms]`);

    // ── 6. Feature flag branch ─────────────────────────────────────────────────
    if (!AI_ENABLED) {
      const body: ExtractionResponse = {
        ok: true,
        mode: 'extraction',
        full_text_length: resumeText.length,
        preview_text: resumeText.slice(0, PREVIEW_CHARS),
        truncated: false,
        elapsed_ms: Date.now() - start,
      };
      return NextResponse.json(body);
    }

    // ── 7. AI analysis ─────────────────────────────────────────────────────────
    const truncated = resumeText.length > AI_CHAR_LIMIT;
    const textForAI = resumeText.slice(0, AI_CHAR_LIMIT);

    console.log(`🤖 Calling Groq — ${textForAI.length} chars, truncated: ${truncated}`);

    let rawAIOutput: unknown;
    try {
      rawAIOutput = await callGroq(textForAI);
    } catch (e: any) {
      console.error(`❌ Groq failed: ${e?.message ?? e} [+${Date.now() - start}ms]`);
      const body: ErrorResponse = {
        ok: false, mode: 'error',
        error: 'AI analysis failed. Please try again.',
        code: 'AI_FAILED',
      };
      return NextResponse.json(body, { status: 500 });
    }

    // normalizeAnalysisResult is the contract enforcer — raw AI output never
    // reaches the frontend directly. Every field is validated and given a safe
    // default if missing or of the wrong type.
    const analysis = normalizeAnalysisResult(rawAIOutput);

    console.log(`✅ AI analysis complete — score: ${analysis.final_score} [+${Date.now() - start}ms]`);

    const successBody: AnalysisResponse = {
      ok: true,
      mode: 'analysis',
      full_text_length: resumeText.length,
      preview_text: resumeText.slice(0, PREVIEW_CHARS),
      truncated,
      elapsed_ms: Date.now() - start,
      analysis,
    };
    return NextResponse.json(successBody);

  } catch (e: any) {
    console.error('❌ Unhandled error in /api/analyze:', e?.message ?? e);
    const body: ErrorResponse = {
      ok: false, mode: 'error',
      error: 'Unexpected server error. Please try again.',
      code: 'SERVER_ERROR',
    };
    return NextResponse.json(body, { status: 500 });
  }
}
