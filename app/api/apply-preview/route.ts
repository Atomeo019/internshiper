import { NextRequest, NextResponse } from 'next/server';

export const runtime     = 'nodejs';
export const maxDuration = 10;

const GROQ_TIMEOUT = 7500;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApplyPreviewRequest {
  jd: string;
  analysis: {
    detected_role:       string;
    project_analysis:    string;
    experience_analysis: string;
    strengths:           string[];
  };
}

interface ApplyPreviewSuccess {
  ok: true;
  preview: string;   // first paragraph of the cover letter
}

interface ApplyPreviewError {
  ok: false;
  error: string;
  code: string;
}

// ── System prompt ─────────────────────────────────────────────────────────────
// Goal: a single compelling opening paragraph that hooks the recruiter.
// Rules:
//   - Never start with "I am excited to apply" or any generic opener.
//   - Lead with the most impressive, specific thing from the candidate's background.
//   - Mirror the exact language/keywords from the JD.
//   - Reference a specific project or role from the candidate data — no generics.
//   - 3-4 sentences only. Stop.

const SYSTEM_PROMPT = `You are a brutally effective career coach. Write ONLY the opening paragraph of a cover letter — exactly 3 sentences, no more, no less.

SENTENCE 1 — THE HOOK (most important):
Start with a specific project name or concrete achievement. The first word must be "I" or the project name.
ALLOWED openers: "I built X", "My X project", "After shipping X", "X reduced Y by Z%"
BANNED openers (any of these = automatic failure): "With a strong", "As a [adjective]", "I am excited", "I am passionate", "I am writing", "Having", "With my", "As someone", "Throughout my"

SENTENCE 2 — THE BRIDGE:
Connect exactly ONE specific thing from their background to exactly ONE specific requirement from the JD. Name both explicitly. Write it like a human, not a form.
BANNED bridge phrasing (automatic failure): "aligns with the requirement of", "as specified in the", "as outlined in the", "meets the requirement", "as required by", "fulfills the need for"
GOOD bridge examples: "That same stack maps directly to DevCore's FastAPI requirement." / "Building that engine taught me exactly the distributed tracing skills your platform team needs." / "The SQL query engine I shipped is the kind of tool your developer platform is built around."

SENTENCE 3 — THE CLOSE:
Name the company. Make a specific claim about what they'll get from hiring this person — not how the candidate feels about it.
BANNED close phrasing (automatic failure): "I am confident I can", "I believe I can", "I look forward to", "I am excited to", "I would love to", "leverage my skills", "contribute to your team"
GOOD close examples: "DevCore gets a backend engineer who's already shipped production APIs, not someone who needs to be trained on them." / "That means DevCore gets someone who can own the API layer from day one."

ABSOLUTE RULES:
- Exactly 3 sentences. Count them. If you write 4, you failed.
- Every sentence must contain at least one specific noun from either the resume or the JD (project name, tech, company name, metric).
- Do NOT repeat the company name more than once across all 3 sentences.
- Output raw text only. No JSON. No markdown. No label. Just the 3 sentences.`;

// ── Groq call ─────────────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function callGroq(userMessage: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const res = await withTimeout(
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Type':   'application/json',
      },
      body: JSON.stringify({
        model:        'llama-3.3-70b-versatile',
        temperature:  0.3,   // tighter — less drift, more precision
        max_tokens:   150,   // hard ceiling forces 3-sentence discipline
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMessage    },
        ],
      }),
    }),
    GROQ_TIMEOUT,
    'Groq'
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`);
  }

  const json  = await res.json();
  const text: string = json?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('Groq returned empty content');
  return text.trim();
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    let body: Partial<ApplyPreviewRequest>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json<ApplyPreviewError>(
        { ok: false, error: 'Invalid JSON body.', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    const { jd, analysis } = body;

    // Validation
    if (!jd || typeof jd !== 'string' || jd.trim().length < 50) {
      return NextResponse.json<ApplyPreviewError>(
        { ok: false, error: 'Job description must be at least 50 characters.', code: 'JD_TOO_SHORT' },
        { status: 422 }
      );
    }
    if (!analysis || typeof analysis !== 'object') {
      return NextResponse.json<ApplyPreviewError>(
        { ok: false, error: 'Missing analysis data.', code: 'NO_ANALYSIS' },
        { status: 422 }
      );
    }

    const truncatedJd = jd.slice(0, 3000); // cap to control token usage

    const userMessage = `
CANDIDATE BACKGROUND:
- Role type: ${analysis.detected_role ?? 'SWE'}
- Project background: ${analysis.project_analysis ?? 'No project data.'}
- Work experience: ${analysis.experience_analysis ?? 'No experience data.'}
- Key strengths: ${(analysis.strengths ?? []).slice(0, 3).join('; ')}

JOB DESCRIPTION (first 3000 chars):
${truncatedJd}

Write the opening paragraph of a tailored cover letter for this candidate applying to this role. Follow your rules.
`.trim();

    let preview: string;
    try {
      preview = await callGroq(userMessage);
    } catch (e: any) {
      console.error('apply-preview Groq error:', e?.message);
      return NextResponse.json<ApplyPreviewError>(
        { ok: false, error: 'Cover letter generation failed. Please try again.', code: 'AI_FAILED' },
        { status: 500 }
      );
    }

    return NextResponse.json<ApplyPreviewSuccess>({ ok: true, preview });

  } catch (e: any) {
    console.error('apply-preview unhandled:', e?.message);
    return NextResponse.json<ApplyPreviewError>(
      { ok: false, error: 'Unexpected error. Please try again.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
