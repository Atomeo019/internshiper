import { NextRequest, NextResponse } from 'next/server';
import type { ExtractionResponse, AnalysisResponse, ErrorResponse } from '@/lib/types';
import { normalizeAnalysisResult } from '@/lib/normalize';

// ── Feature flag ──────────────────────────────────────────────────────────────
const AI_ENABLED    = true;
const AI_CHAR_LIMIT = 6000;
const PREVIEW_CHARS = 500;
const GROQ_TIMEOUT  = 8000; // ms — headroom under Vercel 10s maxDuration

// ── AI Prompt ─────────────────────────────────────────────────────────────────
// Design principles:
// 1. Role detection is the first job — wrong role = wrong advice.
// 2. All scoring rubrics are explicit — no room for the model to invent criteria.
// 3. Red flags are objects with severity — a string isn't enough.
// 4. `top_priority` is extracted separately so the UI can surface it prominently.
// 5. The model is instructed to be pessimistic rather than optimistic — false
//    confidence is the failure mode we're protecting against.
// 6. All enum values are listed — model cannot hallucinate new values.
// temperature: 0.1 + json_object mode makes structural drift rare.
// normalizeAnalysisResult is the safety net if drift still occurs.

const GROQ_SYSTEM_PROMPT = `You are a senior technical recruiter at a top-tier tech company. You have reviewed 10,000+ resumes. You are not here to encourage — you are here to give the honest assessment that a recruiter makes in the first 10 seconds.

Analyze the provided resume text and return a single JSON object. No markdown. No explanation. No code fences. Raw JSON only.

STEP 1: DETECT THE ROLE first. Everything else depends on this.
Roles: "SWE" (software engineering), "Data" (data science/analytics), "DevOps" (infra/cloud/SRE), "PM" (product management), "Design" (UI/UX), "IT-Ops" (IT support/sysadmin), "Career-Pivot" (experience doesn't match apparent target), "Unknown"
Set role_confidence 0-100. If < 60, you are guessing — note this in the verdict.
Set is_career_pivot: true if the work history does not match the expected skills for the target role.

SCORING RUBRICS (score against the detected role's standards, not generic standards):

technical_depth (0-100): For SWE: does the resume demonstrate actual programming depth? Real complexity, not just tool names. 0 = tool names with no evidence of usage. 100 = complex systems, contributions to real codebases with measurable complexity.

project_impact (0-100): Does any project show real scale, real users, or real measurable outcomes? 0 = no projects or projects with no outcomes stated. 50 = projects exist but are toy/tutorial level. 100 = projects with scale metrics, users, or production deployment.

experience_relevance (0-100): How directly does work history map to the target role? 0 = entirely different field. 100 = directly relevant at increasing scope.

ats_compatibility (0-100): Standard sections? Clean formatting? Parseable? 0 = tables/columns/images/headers. 100 = clean single-column, standard section names.

narrative_clarity (0-100): Are bullets action-verb + specific outcome? Or responsibility-statements? 0 = "helped with", "assisted in", "responsible for". 100 = "built X that reduced Y by Z%".

completeness (0-100): Are all expected sections present? For SWE intern: Education (with graduation date), Projects, Skills, Experience (if any), Contact. 30 points off per missing required section.

RED FLAG RULES: Only include real rejection triggers. Each flag must be specific to this resume, not generic advice. Severity:
- Critical: eliminates the resume before a human sees it, or causes immediate rejection
- High: strong disadvantage in competitive pools
- Medium: noticeable gap that hurts in close comparisons

HIRING PREDICTION RULES: Be pessimistic. Most resumes get rejected.
- outcome "Strong": resume consistently lands interviews at target tier, no critical flags
- outcome "Possible": gets interviews at mid-tier companies if well-targeted
- outcome "Unlikely": occasional interviews but usually rejected; needs significant work
- outcome "No": will not get interviews in current state
- screen_pass_rate: realistic estimate of % of applications that clear initial ATS/screen
- competitive_tier: "FAANG" (top 5 companies), "Top-50" (well-known tech companies), "Mid-Market" (solid tech companies), "Startup-Only" (only realistic target), "Not-Ready" (not viable yet)

REQUIRED JSON SCHEMA — all fields required:
{
  "detected_role": string,
  "role_confidence": integer 0-100,
  "is_career_pivot": boolean,
  "hiring_prediction": {
    "outcome": "Strong" | "Possible" | "Unlikely" | "No",
    "screen_pass_rate": integer 0-100,
    "competitive_tier": "FAANG" | "Top-50" | "Mid-Market" | "Startup-Only" | "Not-Ready",
    "verdict": string (one direct, unambiguous sentence — no softening)
  },
  "content_score": integer 0-100,
  "ats_score": integer 0-100,
  "has_metrics": boolean,
  "summary": string (2-3 sentences, direct recruiter perspective — comfortable truths are useless),
  "dimension_scores": {
    "technical_depth": integer 0-100,
    "project_impact": integer 0-100,
    "experience_relevance": integer 0-100,
    "ats_compatibility": integer 0-100,
    "narrative_clarity": integer 0-100,
    "completeness": integer 0-100
  },
  "red_flags": [
    {
      "flag": string (specific to this resume, not generic),
      "severity": "Critical" | "High" | "Medium",
      "impact": string (the exact hiring consequence)
    }
  ],
  "strengths": string[] (3-5 specific genuine strengths with evidence from the resume — no generic praise),
  "issues": string[] (3-6 specific, actionable issues ordered by severity),
  "top_priority": string (the single change that will have the most impact on getting interviews — be specific),
  "action_plan": string[] (5 steps ordered by hiring impact, most impactful first),
  "skills_analysis": {
    "strong_skills": string[] (skills with actual evidence in projects or work history),
    "weak_skills": string[] (skills listed in skills section but not demonstrated anywhere in the resume),
    "missing_skills": string[] (important skills absent for the detected role — only list skills NOT already on the resume)
  },
  "project_analysis": string (2-3 sentences on project complexity and impact — be specific about what's missing),
  "experience_analysis": string (2-3 sentences on work experience depth and relevance — be specific),
  "ats_breakdown": {
    "parsing_risk": "None" | "Low" | "Medium" | "High" | "Critical",
    "keyword_density": "None" | "Low" | "Adequate" | "Strong",
    "formatting_issues": string[],
    "missing_keywords": string[],
    "ats_verdict": string
  },
  "upgrade_insight": {
    "action": string (single highest-impact change this specific candidate can make this week),
    "expected_score_increase": integer 1-20,
    "reason": string (why this specific action matters for this specific resume)
  },
  "competitive_position": string (where does this candidate realistically sit vs. the applicant pool they're competing in)
}

CRITICAL: Do not invent skills as "missing" if they appear in the resume. Do not give "Strong" or "Possible" outcome when Critical red flags exist. If the resume has no projects, project_impact must be 0. Generic feedback is worthless — reference specifics from the resume text.`;

// ── pdf-parse import ──────────────────────────────────────────────────────────
// require() instead of ESM import — avoids CJS/ESM interop where the default
// binding resolves to undefined and pdfParse(buffer) throws synchronously.
const pdfParse: (buf: Buffer | Uint8Array, opts?: object) => Promise<{ text: string }> =
  // eslint-disable-next-line
  require('pdf-parse');

export const runtime    = 'nodejs';
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
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

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
// Returns raw parsed JSON — caller passes it through normalizeAnalysisResult.
// Throws on: missing API key, network failure, non-200, unparseable content.

async function callGroq(resumeText: string): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const response = await withTimeout(
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 2500,
        messages: [
          { role: 'system', content: GROQ_SYSTEM_PROMPT },
          { role: 'user',   content: `RESUME TEXT:\n\n${resumeText}` },
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

    const bytes  = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    console.log(`📥 Received file: "${file.name}" — ${buffer.length} bytes`);

    // ── 2. PDF header check ────────────────────────────────────────────────────
    const header = buffer.slice(0, 8).toString('ascii');
    if (!header.startsWith('%PDF')) {
      const body: ErrorResponse = {
        ok: false, mode: 'error',
        error: 'Not a valid PDF. Export your resume as a PDF and try again.',
        code: 'INVALID_PDF',
      };
      return NextResponse.json(body, { status: 422 });
    }

    // ── 3. Parser availability guard ──────────────────────────────────────────
    if (typeof pdfParse !== 'function') {
      const body: ErrorResponse = { ok: false, mode: 'error', error: 'PDF parser unavailable.', code: 'PARSER_UNAVAILABLE' };
      return NextResponse.json(body, { status: 500 });
    }

    // ── 4. Text extraction ────────────────────────────────────────────────────
    let resumeText: string | null = null;

    try {
      const uint8   = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const pdfData = await withTimeout(pdfParse(uint8), 5000, 'pdf-parse');
      const text    = (pdfData.text ?? '').trim();
      console.log(`📄 pdf-parse: ${text.length} chars`);
      if (text.length >= 20) resumeText = text;
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.warn(`⚠️  pdf-parse failed: ${msg}`);
      if (/decrypt|password/i.test(msg)) {
        const body: ErrorResponse = {
          ok: false, mode: 'error',
          error: 'PDF is password-protected. Remove the password and try again.',
          code: 'PDF_ENCRYPTED',
        };
        return NextResponse.json(body, { status: 422 });
      }
    }

    if (!resumeText) {
      try {
        const text = extractWithRegex(buffer);
        console.log(`📄 regex fallback: ${text.length} chars`);
        if (text.length >= 20) resumeText = text;
      } catch (e: any) {
        console.warn(`⚠️  regex fallback failed: ${e?.message ?? e}`);
      }
    }

    if (!resumeText) {
      const body: ErrorResponse = {
        ok: false, mode: 'error',
        error: 'Could not read text from your PDF. Try re-exporting from Word, Google Docs, or Overleaf.',
        code: 'PARSE_FAILED',
      };
      return NextResponse.json(body, { status: 422 });
    }

    console.log(`📄 Final text: ${resumeText.length} chars [+${Date.now() - start}ms]`);

    // ── 5. Feature flag ───────────────────────────────────────────────────────
    if (!AI_ENABLED) {
      const body: ExtractionResponse = {
        ok: true, mode: 'extraction',
        full_text_length: resumeText.length,
        preview_text:     resumeText.slice(0, PREVIEW_CHARS),
        truncated:        false,
        elapsed_ms:       Date.now() - start,
      };
      return NextResponse.json(body);
    }

    // ── 6. AI analysis ─────────────────────────────────────────────────────────
    const truncated  = resumeText.length > AI_CHAR_LIMIT;
    const textForAI  = resumeText.slice(0, AI_CHAR_LIMIT);

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

    // normalizeAnalysisResult enforces contract and applies anti-inflation rules.
    // We pass resumeText so it can filter hallucinated missing_skills.
    const analysis = normalizeAnalysisResult(rawAIOutput, resumeText);

    console.log(`✅ Analysis complete — score: ${analysis.final_score}, outcome: ${analysis.hiring_prediction.outcome} [+${Date.now() - start}ms]`);

    const successBody: AnalysisResponse = {
      ok: true, mode: 'analysis',
      full_text_length: resumeText.length,
      preview_text:     resumeText.slice(0, PREVIEW_CHARS),
      truncated,
      elapsed_ms:       Date.now() - start,
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
