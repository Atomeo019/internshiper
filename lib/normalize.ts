// Single validation barrier between AI output and the UI.
//
// This file enforces three things:
// 1. Type safety — every field is the right type, period.
// 2. Anti-inflation rules — hard score caps that AI cannot override.
// 3. Hallucination defense — missing_skills purged against actual resume text.
//
// normalizeAnalysisResult MUST be called on the server (route.ts) where
// resumeText is in scope. The client should not call it directly.

import type { AnalysisResult, RedFlag, DimensionScores, HiringPrediction } from './types';

// ── Primitive sanitizers ──────────────────────────────────────────────────────

export function safeObj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback;
}

export function safeInt(v: unknown, fallback: number, min = 0, max = 100): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function safeBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function safeStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

// ── Enum sanitizers ───────────────────────────────────────────────────────────

function safeParsingRisk(v: unknown): AnalysisResult['ats_breakdown']['parsing_risk'] {
  const valid = ['None', 'Low', 'Medium', 'High', 'Critical'] as const;
  return valid.includes(v as any) ? (v as AnalysisResult['ats_breakdown']['parsing_risk']) : 'Medium';
}

function safeKeywordDensity(v: unknown): AnalysisResult['ats_breakdown']['keyword_density'] {
  const valid = ['None', 'Low', 'Adequate', 'Strong'] as const;
  return valid.includes(v as any) ? (v as AnalysisResult['ats_breakdown']['keyword_density']) : 'Low';
}

function safeOutcome(v: unknown): HiringPrediction['outcome'] {
  const valid = ['Strong', 'Possible', 'Unlikely', 'No'] as const;
  return valid.includes(v as any) ? (v as HiringPrediction['outcome']) : 'Unlikely';
}

function safeTier(v: unknown): HiringPrediction['competitive_tier'] {
  const valid = ['FAANG', 'Top-50', 'Mid-Market', 'Startup-Only', 'Not-Ready'] as const;
  return valid.includes(v as any) ? (v as HiringPrediction['competitive_tier']) : 'Not-Ready';
}

function safeRedFlagSeverity(v: unknown): RedFlag['severity'] {
  const valid = ['Critical', 'High', 'Medium'] as const;
  return valid.includes(v as any) ? (v as RedFlag['severity']) : 'Medium';
}

// ── Red flag normalizer ───────────────────────────────────────────────────────

function normalizeRedFlag(v: unknown): RedFlag | null {
  // Accept both legacy string format and the new object format
  if (typeof v === 'string' && v.trim().length > 0) {
    return { flag: v.trim(), severity: 'High', impact: 'May cause rejection during screening.' };
  }
  const r = safeObj(v);
  const flag = safeStr(r.flag);
  if (!flag) return null;
  return {
    flag,
    severity: safeRedFlagSeverity(r.severity),
    impact: safeStr(r.impact, 'May negatively affect hiring decisions.'),
  };
}

// ── Hallucination defense ─────────────────────────────────────────────────────
// Removes skills from missing_skills if they're actually present in the resume.
// This runs on the server where resumeText is in scope.
// Case-insensitive, handles multi-word skills ("machine learning", "react.js").

function filterHallucinatedMissingSkills(skills: string[], resumeText: string): string[] {
  const textLower = resumeText.toLowerCase();
  return skills.filter((skill) => {
    const normalized = skill.toLowerCase().replace(/[.\-_]/g, ' ').trim();
    return !textLower.includes(normalized);
  });
}

// ── Anti-inflation rules ──────────────────────────────────────────────────────
// These run after AI output is parsed. They enforce minimum honesty.
// The AI cannot override them.

function applyScoreCaps(
  finalScore: number,
  contentScore: number,
  dims: DimensionScores,
  redFlags: RedFlag[],
  isCareerPivot: boolean,
): { finalScore: number; contentScore: number } {
  let fs = finalScore;
  let cs = contentScore;

  // No projects → content score floor
  if (dims.project_impact === 0 || dims.project_impact < 10) {
    cs = Math.min(cs, 45);
  }

  // Critical red flag → overall score capped
  if (redFlags.some((f) => f.severity === 'Critical')) {
    fs = Math.min(fs, 55);
  }

  // Incomplete resume → hard cap
  if (dims.completeness < 30) {
    fs = Math.min(fs, 40);
  }

  // Career pivot with no demonstrated engineering → cap
  if (isCareerPivot && dims.technical_depth < 40) {
    fs = Math.min(fs, 50);
  }

  return { finalScore: fs, contentScore: cs };
}

// Profile strength must agree with the score and red flags.
// Computing them independently creates contradictions users catch immediately.
function deriveProfileStrength(
  finalScore: number,
  redFlags: RedFlag[],
): AnalysisResult['profile_strength'] {
  const hasCritical = redFlags.some((f) => f.severity === 'Critical');
  if (finalScore >= 78 && !hasCritical) return 'Strong';
  if (finalScore >= 62 && !hasCritical) return 'Good';
  if (finalScore >= 42)                  return 'Average';
  return 'Weak';
}

// Hiring outcome must also agree with score — AI tends to be optimistic.
function deriveHiringOutcome(finalScore: number, redFlags: RedFlag[]): HiringPrediction['outcome'] {
  const hasCritical = redFlags.some((f) => f.severity === 'Critical');
  if (finalScore >= 78 && !hasCritical) return 'Strong';
  if (finalScore >= 60 && !hasCritical) return 'Possible';
  if (finalScore >= 42)                  return 'Unlikely';
  return 'No';
}

function deriveCompetitiveTier(
  finalScore: number,
  redFlags: RedFlag[],
  aiTier: HiringPrediction['competitive_tier'],
): HiringPrediction['competitive_tier'] {
  const hasCritical = redFlags.some((f) => f.severity === 'Critical');
  // If AI said FAANG but there are critical flags, that's false confidence
  if (aiTier === 'FAANG' && hasCritical) return 'Mid-Market';
  if (finalScore < 42) return 'Not-Ready';
  if (finalScore < 55) return 'Startup-Only';
  return aiTier; // trust AI for the upper tiers
}

// ── Public normalizer ─────────────────────────────────────────────────────────

export function normalizeAnalysisResult(raw: unknown, resumeText = ''): AnalysisResult {
  const r   = safeObj(raw);
  const sa  = safeObj(r.skills_analysis);
  const atb = safeObj(r.ats_breakdown);
  const ui  = safeObj(r.upgrade_insight);
  const hp  = safeObj(r.hiring_prediction);
  const ds  = safeObj(r.dimension_scores);

  // ── Dimensions ──────────────────────────────────────────────────────────────
  const dims: DimensionScores = {
    technical_depth:       safeInt(ds.technical_depth,      50),
    project_impact:        safeInt(ds.project_impact,       0),
    experience_relevance:  safeInt(ds.experience_relevance, 40),
    ats_compatibility:     safeInt(ds.ats_compatibility,    50),
    narrative_clarity:     safeInt(ds.narrative_clarity,    50),
    completeness:          safeInt(ds.completeness,         40),
  };

  // ── Red flags ───────────────────────────────────────────────────────────────
  const rawRedFlags = Array.isArray(r.red_flags) ? r.red_flags : [];
  const redFlags: RedFlag[] = rawRedFlags
    .map(normalizeRedFlag)
    .filter((f): f is RedFlag => f !== null);

  // ── Career pivot ────────────────────────────────────────────────────────────
  const isCareerPivot = safeBool(r.is_career_pivot, false);

  // ── Base scores ─────────────────────────────────────────────────────────────
  const rawContent = safeInt(r.content_score, 50);
  const atsScore   = safeInt(r.ats_score,     40);
  // Derive final from components — AI arithmetic is unreliable
  const rawFinal   = Math.round(rawContent * 0.6 + atsScore * 0.4);

  // ── Anti-inflation caps ──────────────────────────────────────────────────────
  const { finalScore, contentScore } = applyScoreCaps(rawFinal, rawContent, dims, redFlags, isCareerPivot);

  // ── Profile strength — derived, never trusted from AI directly ──────────────
  const profileStrength = deriveProfileStrength(finalScore, redFlags);

  // ── Skills — hallucination defense ─────────────────────────────────────────
  const rawMissingSkills = safeStrArray(sa.missing_skills);
  const missingSkills = resumeText
    ? filterHallucinatedMissingSkills(rawMissingSkills, resumeText)
    : rawMissingSkills;

  // ── Hiring prediction — overrides AI optimism where rules disagree ──────────
  const aiOutcome  = safeOutcome(hp.outcome);
  const aiTier     = safeTier(hp.competitive_tier);
  const outcome    = deriveHiringOutcome(finalScore, redFlags);
  // Use the more pessimistic of AI vs rule-based
  const outcomePriority: Record<HiringPrediction['outcome'], number> = { Strong: 3, Possible: 2, Unlikely: 1, No: 0 };
  const finalOutcome = outcomePriority[outcome] <= outcomePriority[aiOutcome] ? outcome : aiOutcome;
  const finalTier  = deriveCompetitiveTier(finalScore, redFlags, aiTier);

  const hiringPrediction: HiringPrediction = {
    outcome:          finalOutcome,
    screen_pass_rate: safeInt(hp.screen_pass_rate, finalScore),
    competitive_tier: finalTier,
    verdict:          safeStr(hp.verdict, 'Hiring outlook could not be determined.'),
  };

  return {
    detected_role:    safeStr(r.detected_role, 'Unknown'),
    role_confidence:  safeInt(r.role_confidence, 50),
    is_career_pivot:  isCareerPivot,
    hiring_prediction: hiringPrediction,
    final_score:      finalScore,
    dimension_scores: dims,
    content_score:    contentScore,
    ats_score:        atsScore,
    has_metrics:      safeBool(r.has_metrics, false),
    profile_strength: profileStrength,
    summary:          safeStr(r.summary, 'Analysis complete. See detailed breakdown below.'),
    red_flags:        redFlags,
    strengths:        safeStrArray(r.strengths),
    issues:           safeStrArray(r.issues),
    action_plan:      safeStrArray(r.action_plan),
    top_priority:     safeStr(r.top_priority, safeStrArray(r.action_plan)[0] ?? 'Review the issues listed below.'),
    skills_analysis: {
      strong_skills:  safeStrArray(sa.strong_skills),
      weak_skills:    safeStrArray(sa.weak_skills),
      missing_skills: missingSkills,
    },
    project_analysis:    safeStr(r.project_analysis,    'No project analysis available.'),
    experience_analysis: safeStr(r.experience_analysis, 'No experience analysis available.'),
    ats_breakdown: {
      parsing_risk:      safeParsingRisk(atb.parsing_risk),
      keyword_density:   safeKeywordDensity(atb.keyword_density),
      formatting_issues: safeStrArray(atb.formatting_issues),
      missing_keywords:  safeStrArray(atb.missing_keywords),
      ats_verdict:       safeStr(atb.ats_verdict, 'ATS compatibility analysis unavailable.'),
    },
    upgrade_insight: {
      action:                  safeStr(ui.action, 'Add quantified metrics to your bullet points.'),
      expected_score_increase: safeInt(ui.expected_score_increase, 5, 1, 20),
      reason:                  safeStr(ui.reason, 'Metrics demonstrate impact and make your resume stand out.'),
    },
    competitive_position: safeStr(r.competitive_position, ''),
  };
}
