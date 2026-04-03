import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
// Use specific internal path to prevent Next.js webpack from bundling test files
const pdfParse = require('pdf-parse/lib/pdf-parse.js'); // eslint-disable-line

// ============================================================
// TYPES — Phase 1 (internships moved to Phase 2)
// ============================================================
export interface AnalysisResult {
  final_score: number;
  content_score: number;
  ats_score: number;
  has_metrics: boolean;
  profile_strength: 'Weak' | 'Average' | 'Good' | 'Strong';
  summary: string;
  strengths: string[];
  issues: string[];
  red_flags: string[];
  action_plan: string[];
  skills_analysis: {
    strong_skills: string[];
    weak_skills: string[];
    missing_skills: string[];
  };
  project_analysis: string;
  experience_analysis: string;
  ats_breakdown: {
    parsing_risk: 'None' | 'Low' | 'Medium' | 'High' | 'Critical';
    keyword_density: 'None' | 'Low' | 'Adequate' | 'Strong';
    formatting_issues: string[];
    missing_keywords: string[];
    ats_verdict: string;
  };
  upgrade_insight: {
    action: string;
    expected_score_increase: number;
    reason: string;
  };
  competitive_position: string;
}

// ============================================================
// SYSTEM PROMPT — v5 (Phase 1, stacking caps, red flags enforced)
// ============================================================
const SYSTEM_PROMPT = `You are a senior technical recruiter who has reviewed tens of thousands of internship applications at top-tier tech companies — Google, Meta, Amazon, Microsoft, and high-growth startups. You have rejected 90% of applicants. You know exactly what separates candidates who get callbacks from those who don't.

Your evaluation reflects cold, competitive reality. Encouragement that is not earned is deception. Do not soften scores. Do not hedge feedback. A resume that would be rejected by most competitive programs must score below 55.

---

BENCHMARK
Evaluate every resume against top-25% competitive tech internship programs. Not any internship — competitive programs.

---

SCORING ARCHITECTURE

content_score (0-100):
  Skills relevance and demonstrated depth: 25%
  Project quality, complexity, measurable impact: 25%
  Experience strength and ownership: 20%
  Resume clarity and structure: 15%
  Role alignment: 15%

ats_score (0-100): survival rate through automated filtering

final_score = (content_score x 0.70) + (ats_score x 0.30)

---

METRICS CHECK:
Set "has_metrics" to true ONLY if the resume contains concrete numbers: %, $, users, performance gains, time saved, lines of code, test coverage. "Improved performance" does NOT count. If entirely vague, set false.

---

CONTENT SCORING — HOW CAPS STACK

Each hard rule that applies creates a CEILING. Multiple ceilings stack — take the LOWEST ceiling as the final cap.

EXAMPLE: No metrics (ceiling 62) + AI mislabeling (ceiling 55) = content_score cannot exceed 55.

The ceiling is a MAXIMUM, not a target. After applying the lowest ceiling, subtract all other deductions. The final content_score can and should be well below the ceiling.

RULE 1 — No quantified metrics anywhere: ceiling 62. has_metrics must be false.
RULE 2 — "Attended [meetings/stand-ups/events]" as a bullet: ceiling 57. THIS VIOLATION IS MANDATORY IN red_flags. Also deduct 5 from running score.
RULE 3 — Passive language dominates ("worked on", "helped", "assisted", "was involved in"): deduct 2 per passive bullet, max deduction 12.
RULE 4 — Project mislabeled as "AI/ML/blockchain" with zero actual implementation: ceiling 52. THIS VIOLATION IS MANDATORY IN red_flags. Also deduct 10 from running score.
RULE 5 — No career objective or professional summary: deduct 5.
RULE 6 — Vague bullet with no context, ownership, or result: deduct 2 per bullet.
RULE 7 — No GitHub or portfolio for a technical candidate: deduct 5.
RULE 8 — Resume over 1 page for under 2 years experience: deduct 3.
RULE 9 — Skills listed but not demonstrated: goes in weak_skills, not strong_skills.

HOW TO CALCULATE content_score:
Step 1: Identify all violated rules and find the lowest ceiling among Rule 1, 2, 4. That is your maximum.
Step 2: Start from that ceiling value.
Step 3: Subtract deductions from Rule 3, 5, 6, 7, 8.
Step 4: content_score = ceiling minus all deductions. Never go below 10.

---

ATS HARD RULES (apply before calculating ats_score):
RULE A: Two-column layout → ats_score ceiling 50
RULE B: Graphics, icons, skill bars → deduct 20
RULE C: Contact info in header/footer → deduct 15
RULE D: Non-standard section names → deduct 15 per section
RULE E: Tables for layout → deduct 15
RULE F: Scanned/image PDF → ats_score ceiling 20
RULE G: Acronyms only without spelling out (ML not Machine Learning) → deduct 5 per case
RULE H: Missing role-critical keywords → deduct 5-15
RULE I: Inconsistent date formatting → deduct 5
RULE J: Over-styled formatting → deduct 10

---

CONTENT SCORE CALIBRATION (use this to verify your score makes sense):
0-40:  Would be rejected immediately by virtually all competitive programs
41-50: Serious problems. Callbacks only from non-competitive companies.
51-60: Below average. Competitive only for small/local internships.
61-70: Average. Some mid-tier callbacks but struggles at top tier.
71-80: Good. Competitive at mid-to-large tech, borderline FAANG.
81-90: Strong. Competitive at most companies including top tier.
91-100: Exceptional. Rare.

ATS SCORE CALIBRATION:
0-40:  Rejected or mangled before a human sees it
41-60: Significant parsing issues
61-75: Passes basic parsing, keyword gaps reduce visibility
76-90: Good ATS compatibility
91-100: Near-perfect

---

PROFILE STRENGTH — STRICT MAPPING:
final_score 0-55   → "Weak"
final_score 56-65  → "Average"
final_score 66-78  → "Good"
final_score 79-100 → "Strong"

---

ISSUES vs RED FLAGS — CRITICAL DISTINCTION:

ISSUES: Problems fixable by editing. Poor word choice, missing sections, weak bullets. Goes in "issues" array.

RED FLAGS: Items that cause AUTOMATIC REJECTION by ATS/recruiter OR destroy credibility in a technical interview. Goes in "red_flags" array. NEVER in issues only.

MANDATORY RED FLAG TRIGGERS (if present, MUST appear in red_flags):
- Any bullet saying "Attended [meetings/stand-ups/events/calls]" — wastes resume space, signals candidate doesn't know what matters
- Any project named "AI/ML/blockchain" where the bullets reveal zero actual AI/ML/blockchain implementation — technical interviewers will expose this immediately
- Skills listed that are completely unrelated to any project or experience (suggests fabrication)
- Scanned PDF (ATS reads nothing)

WRONG: Putting "Attended daily stand-up meetings" only in issues.
CORRECT: Putting it in BOTH issues AND red_flags with label "Actively harmful bullet — remove immediately."

---

SUMMARY LANGUAGE — MUST MATCH SCORE:

final_score 0-50:   "This resume would be rejected by virtually all competitive tech internship programs. It is currently competitive only for non-technical or very small local companies..."
final_score 51-60:  "This resume is below average for competitive tech internships. It may generate occasional callbacks from small companies but would be filtered out by most mid-tier and all top-tier programs..."
final_score 61-70:  "This resume has average execution. It may generate callbacks from some mid-tier companies but is not competitive at top-tier tech companies..."
final_score 71-80:  "This resume is competitive at mid-to-large tech companies but needs work to be competitive at FAANG level..."
final_score 81-100: "This resume is strong and competitive across most tech companies..."

Your summary MUST be consistent with the score. A 55 cannot say "competitive for mid-tier companies." A 48 cannot say "good foundation."

COMPETITIVE_POSITION must also match: a sub-60 score means this resume competes only at small/local companies. State this directly.

---

ANALYSIS RULES:
- Quote the exact bullet when flagging issues or red flags.
- Never say "consider adding." Say "add" or "remove."
- action_plan ordered by highest impact first. Include example of what good looks like.
- project_analysis and experience_analysis evaluate each entry individually by name.
- If layout cannot be determined from text: state in ats_verdict "Formatting inferred from text only — visual layout risks cannot be confirmed."`;

// ============================================================
// USER PROMPT
// ============================================================
const buildUserPrompt = (resumeText: string) => `Analyze this resume with brutal accuracy. Apply ALL scoring rules. Show your work in content_score calculation.

RESUME:
${resumeText.slice(0, 8000)}

SCORING INSTRUCTIONS:
1. Check for Rule 1 (no metrics), Rule 2 (attended meetings), Rule 4 (mislabeled AI/ML projects)
2. Find the lowest ceiling from violated rules — that is your content_score maximum
3. Subtract all other deductions from that ceiling
4. Any Rule 2 or Rule 4 violation MUST appear in red_flags array — not just in issues
5. Summary language MUST match the score range exactly

Return ONLY valid JSON:
{
  "final_score": number,
  "content_score": number,
  "ats_score": number,
  "has_metrics": boolean,
  "profile_strength": "Weak" | "Average" | "Good" | "Strong",
  "summary": "2-3 sentences — language MUST match score range. Sub-60 cannot claim mid-tier competitiveness.",
  "strengths": ["specific strength referencing actual content — minimum 1"],
  "issues": ["quote specific bullet, state recruiter impact — minimum 3"],
  "red_flags": ["MANDATORY for attended-meetings bullets and mislabeled AI/ML projects — empty array only if truly none exist"],
  "action_plan": ["highest impact first, include example of what good looks like — minimum 3"],
  "skills_analysis": {
    "strong_skills": ["demonstrated through projects or experience — not just listed"],
    "weak_skills": ["listed but not demonstrated anywhere — interview liability"],
    "missing_skills": ["absent skills competitive candidates typically have"]
  },
  "project_analysis": "evaluate each project by name — what is vague, what is missing, what would make it strong",
  "experience_analysis": "evaluate each role — quote weakest bullet per role, write a strong rewrite",
  "ats_breakdown": {
    "parsing_risk": "None" | "Low" | "Medium" | "High" | "Critical",
    "keyword_density": "None" | "Low" | "Adequate" | "Strong",
    "formatting_issues": ["specific ATS-breaking element"],
    "missing_keywords": ["keywords ATS filters search for"],
    "ats_verdict": "one sentence — would this survive Greenhouse, Workday, or Lever?"
  },
  "upgrade_insight": {
    "action": "single highest-ROI change in 24-48 hours",
    "expected_score_increase": number,
    "reason": "why this matters for both ATS and recruiter"
  },
  "competitive_position": "which tier this resume competes at right now — be direct, match the score"
}`;

// ============================================================
// POST HANDLER
// ============================================================
export async function POST(req: NextRequest) {
  try {
    // ── 0. RATE LIMIT — disabled for testing phase ───────────
    // TODO: Re-enable rate limiting before production launch

    // ── 1. GET FILE ──────────────────────────────────────────
    const formData = await req.formData();
    const file = (formData.get('file') || formData.get('resume')) as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    // ── 2. EXTRACT TEXT ──────────────────────────────────────
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const data = await pdfParse(buffer);
    const resumeText = data.text?.trim();

    if (!resumeText || resumeText.length < 50) {
      return NextResponse.json(
        { error: 'Could not extract text from the PDF. Make sure it is not a scanned image.' },
        { status: 422 }
      );
    }

    console.log('✅ PDF extracted —', resumeText.length, 'characters');

    // ── 3. CALL GROQ ─────────────────────────────────────────
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(resumeText) },
      ],
      temperature: 0.1,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    });

    const rawText = completion.choices[0]?.message?.content?.trim() ?? '';

    // ── 4. PARSE JSON ────────────────────────────────────────
    let analysis: AnalysisResult;
    try {
      const cleaned = rawText
        .replace(/^```(?:json)?\n?/i, '')
        .replace(/\n?```$/i, '')
        .trim();
      analysis = JSON.parse(cleaned);
    } catch {
      console.error('❌ Groq returned invalid JSON:', rawText);
      return NextResponse.json(
        { error: 'AI returned an invalid response. Please try again.' },
        { status: 500 }
      );
    }

    // ── 5. POST-PROCESSING LAYER ─────────────────────────────
    analysis.red_flags = analysis.red_flags ?? [];

    // ── CONTENT SCORE: Stacking Ceilings ────────────────────
    // Each ceiling is a HARD MAX. Multiple violations stack — lowest wins.
    // The ceiling is applied REGARDLESS of what the AI returned.

    let contentCeiling = 100;

    // Ceiling 1: No metrics anywhere → max 62
    if (analysis.has_metrics === false) {
      contentCeiling = Math.min(contentCeiling, 62);
      console.log('⚠️  Content Ceiling 1: No metrics → max 62');
    }

    // Ceiling 2: "Attended meetings/stand-ups" bullet → max 57
    const hasAttendedBullet = /attended.*?(meeting|stand.?up|standup|call|event)/i.test(resumeText);
    if (hasAttendedBullet) {
      contentCeiling = Math.min(contentCeiling, 57);
      console.log('⚠️  Content Ceiling 2: Attended meetings bullet → max 57');
      const alreadyFlagged = analysis.red_flags.some(f =>
        f.toLowerCase().includes('attend') || f.toLowerCase().includes('stand-up') || f.toLowerCase().includes('meeting')
      );
      if (!alreadyFlagged) {
        analysis.red_flags.push(
          'Actively harmful bullet: "Attended daily stand-up meetings" wastes resume space and signals the candidate does not know what belongs on a resume. Remove immediately.'
        );
      }
    }

    // Ceiling 3: Project mislabeled as AI/ML with zero real implementation → max 52
    // Applied whenever AI/ML keyword appears but no real implementation evidence exists.
    const hasAIKeyword  = /\bai\b|ai\s+discord|ai\s+bot|machine\s+learning\s+project|ml\s+project/i.test(resumeText);
    const hasRealAI     = /tensorflow|pytorch|openai|huggingface|llm|neural|sklearn|scikit|nlp|bert|gpt|langchain|transformers|model\.fit|model\.predict|train.*dataset|dataset.*train/i.test(resumeText);
    if (hasAIKeyword && !hasRealAI) {
      contentCeiling = Math.min(contentCeiling, 52);
      console.log('⚠️  Content Ceiling 3: Mislabeled AI project → max 52');
      const alreadyFlagged = analysis.red_flags.some(f =>
        f.toLowerCase().includes('mislabel') || f.toLowerCase().includes('no ai') || f.toLowerCase().includes('no ml') ||
        (f.toLowerCase().includes('ai') && f.toLowerCase().includes('implement'))
      );
      if (!alreadyFlagged) {
        analysis.red_flags.push(
          'Credibility risk: A project is labeled as an "AI" or "ML" project but the bullets show zero actual AI/ML implementation — no models, no training, no ML libraries (TensorFlow, PyTorch, scikit-learn, etc.). A technical interviewer will expose this in 30 seconds. Rename the project accurately or add real implementation.'
        );
      }
    }

    // Apply the final stacked ceiling
    if (analysis.content_score > contentCeiling) {
      console.log(`⚠️  content_score capped: ${analysis.content_score} → ${contentCeiling}`);
      analysis.content_score = contentCeiling;
    }

    // ── ATS SCORE: Keyword Reality Check ────────────────────
    // Llama inflates ATS scores. Enforce it with a real keyword scan.
    // These are keywords ATS systems at competitive companies search for
    // in SWE internship roles. Missing too many = score cannot be high.
    const criticalSWEKeywords = [
      'rest', 'api', 'sql', 'docker', 'aws', 'cloud',
      'ci/cd', 'pipeline', 'linux', 'bash',
      'jest', 'test', 'pytest', 'unit test',
      'algorithm', 'data structure',
      'agile', 'scrum', 'git',
    ];
    const resumeLower = resumeText.toLowerCase();
    const presentKeywords  = criticalSWEKeywords.filter(kw => resumeLower.includes(kw));
    const missingCount     = criticalSWEKeywords.length - presentKeywords.length;
    const missingRatio     = missingCount / criticalSWEKeywords.length;

    console.log(`📊 ATS keyword check: ${presentKeywords.length}/${criticalSWEKeywords.length} present (missing ratio: ${(missingRatio * 100).toFixed(0)}%)`);

    // ATS ceiling based on keyword gaps
    // Threshold lowered to 0.68 — a resume missing 68%+ of critical SWE keywords
    // does NOT have "adequate" keyword coverage at competitive programs.
    let atsCeiling = 100;
    if (missingRatio > 0.68) atsCeiling = Math.min(atsCeiling, 45);  // >68% missing → very low
    else if (missingRatio > 0.50) atsCeiling = Math.min(atsCeiling, 58); // >50% missing → below average
    else if (missingRatio > 0.32) atsCeiling = Math.min(atsCeiling, 70); // >32% missing → moderate

    if (analysis.ats_score > atsCeiling) {
      console.log(`⚠️  ats_score capped: ${analysis.ats_score} → ${atsCeiling} (${(missingRatio * 100).toFixed(0)}% critical keywords missing)`);
      analysis.ats_score = atsCeiling;
    }

    // Override AI's ATS breakdown fields with server-computed reality.
    // The AI inflates keyword_density and underreports missing_keywords.
    const missingKeywords = criticalSWEKeywords.filter(kw => !resumeLower.includes(kw));
    if (!analysis.ats_breakdown) {
      analysis.ats_breakdown = {
        parsing_risk: 'Medium',
        keyword_density: 'Low',
        formatting_issues: [],
        missing_keywords: [],
        ats_verdict: 'Unable to determine ATS compatibility.',
      };
    }
    // Keyword density label based on actual scan
    if (missingRatio > 0.68)       analysis.ats_breakdown.keyword_density = 'Low';
    else if (missingRatio > 0.50)  analysis.ats_breakdown.keyword_density = 'Low';
    else if (missingRatio > 0.32)  analysis.ats_breakdown.keyword_density = 'Adequate';
    else                           analysis.ats_breakdown.keyword_density = 'Strong';
    // Inject actual missing keywords (server-verified, not AI guesses)
    const formattedMissing = missingKeywords.map(kw => kw.toUpperCase());
    if (formattedMissing.length > 0) {
      analysis.ats_breakdown.missing_keywords = formattedMissing;
    }
    // Override ats_verdict if score was heavily capped
    if (atsCeiling <= 45) {
      analysis.ats_breakdown.ats_verdict =
        `Critical keyword gap: ${missingKeywords.length} of ${criticalSWEKeywords.length} standard SWE keywords absent. ` +
        `ATS systems at competitive companies will deprioritize or filter this resume before a human sees it.`;
    } else if (atsCeiling <= 58) {
      analysis.ats_breakdown.ats_verdict =
        `Significant keyword gap: ${missingKeywords.length} of ${criticalSWEKeywords.length} standard SWE keywords missing. ` +
        `Resume may pass basic ATS filtering at small companies but will rank poorly at mid-tier and above.`;
    }

    // ── FINAL SCORE: Recalculate — never trust AI math ──────
    analysis.final_score = Math.round(
      (analysis.content_score * 0.70) + (analysis.ats_score * 0.30)
    );

    // ── PROFILE STRENGTH: Enforce strict mapping ─────────────
    const fs = analysis.final_score;
    if (fs <= 55)       analysis.profile_strength = 'Weak';
    else if (fs <= 65)  analysis.profile_strength = 'Average';
    else if (fs <= 78)  analysis.profile_strength = 'Good';
    else                analysis.profile_strength = 'Strong';

    // ── SUMMARY: Clamp language to score reality ─────────────
    const softPhrases = [
      'competitive for mid-tier', 'competitive at mid', 'good foundation',
      'strong base', 'well-positioned', 'competitive for most',
    ];
    const summaryLower2 = (analysis.summary ?? '').toLowerCase();
    const isSoftSummary = softPhrases.some(p => summaryLower2.includes(p));
    if (analysis.final_score < 58 && isSoftSummary) {
      analysis.summary =
        `This resume scores ${analysis.final_score}/100 against competitive tech internship standards — below average. ` +
        `It would be filtered out by most mid-tier and all top-tier programs. ` +
        `Callbacks are realistic only at small or non-competitive companies without significant improvements.`;
    }

    // Rule 5: Defensive defaults
    analysis.red_flags           = analysis.red_flags           ?? [];
    analysis.issues              = analysis.issues              ?? [];
    analysis.strengths           = analysis.strengths           ?? [];
    analysis.action_plan         = analysis.action_plan         ?? [];
    analysis.competitive_position= analysis.competitive_position ?? '';

    if (!analysis.skills_analysis) {
      analysis.skills_analysis = { strong_skills: [], weak_skills: [], missing_skills: [] };
    }
    analysis.skills_analysis.weak_skills    = analysis.skills_analysis.weak_skills    ?? [];
    analysis.skills_analysis.strong_skills  = analysis.skills_analysis.strong_skills  ?? [];
    analysis.skills_analysis.missing_skills = analysis.skills_analysis.missing_skills ?? [];

    // ats_breakdown already initialized and enriched above — no-op here

    console.log(`✅ Analysis complete — content: ${analysis.content_score} | ats: ${analysis.ats_score} | final: ${analysis.final_score} | strength: ${analysis.profile_strength} | red_flags: ${analysis.red_flags.length}`);

    // ── 6. RETURN ─────────────────────────────────────────────
    return NextResponse.json({ success: true, analysis });

  } catch (error) {
    console.error('❌ Analyze error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}

