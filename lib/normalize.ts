// Single validation barrier between AI output and the UI.
// All raw AI JSON must pass through normalizeAnalysisResult before being stored
// or rendered. Every field is sanitized — the UI should never crash regardless
// of what the AI returns.

import type { AnalysisResult } from './types';

// ── Primitive helpers ─────────────────────────────────────────────────────────

function safeObj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback;
}

// Clamps to [min, max] and rounds. Returns fallback if not finite.
function safeInt(v: unknown, fallback: number, min = 0, max = 100): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function safeBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

// Filters out non-strings and blank entries so every .map() in the UI is safe.
function safeStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

// ── Enum helpers ──────────────────────────────────────────────────────────────

function safeProfileStrength(v: unknown): AnalysisResult['profile_strength'] {
  const valid = ['Weak', 'Average', 'Good', 'Strong'] as const;
  return valid.includes(v as AnalysisResult['profile_strength'])
    ? (v as AnalysisResult['profile_strength'])
    : 'Average';
}

function safeParsingRisk(v: unknown): AnalysisResult['ats_breakdown']['parsing_risk'] {
  const valid = ['None', 'Low', 'Medium', 'High', 'Critical'] as const;
  return valid.includes(v as AnalysisResult['ats_breakdown']['parsing_risk'])
    ? (v as AnalysisResult['ats_breakdown']['parsing_risk'])
    : 'Medium';
}

function safeKeywordDensity(v: unknown): AnalysisResult['ats_breakdown']['keyword_density'] {
  const valid = ['None', 'Low', 'Adequate', 'Strong'] as const;
  return valid.includes(v as AnalysisResult['ats_breakdown']['keyword_density'])
    ? (v as AnalysisResult['ats_breakdown']['keyword_density'])
    : 'Low';
}

// ── Public normalizer ─────────────────────────────────────────────────────────

export function normalizeAnalysisResult(raw: unknown): AnalysisResult {
  const r   = safeObj(raw);
  const sa  = safeObj(r.skills_analysis);
  const atb = safeObj(r.ats_breakdown);
  const ui  = safeObj(r.upgrade_insight);

  const contentScore = safeInt(r.content_score, 50);
  const atsScore     = safeInt(r.ats_score, 40);

  // Always derive final_score from components rather than trusting AI arithmetic.
  // This keeps the scoring formula consistent and prevents the animation from
  // receiving a NaN that makes the interval run forever.
  const finalScore = Math.round(contentScore * 0.6 + atsScore * 0.4);

  return {
    final_score:    finalScore,
    content_score:  contentScore,
    ats_score:      atsScore,
    has_metrics:    safeBool(r.has_metrics, false),
    profile_strength: safeProfileStrength(r.profile_strength),
    summary:          safeStr(r.summary, 'Analysis complete. See detailed breakdown below.'),
    strengths:     safeStrArray(r.strengths),
    issues:        safeStrArray(r.issues),
    red_flags:     safeStrArray(r.red_flags),
    action_plan:   safeStrArray(r.action_plan),
    skills_analysis: {
      strong_skills:   safeStrArray(sa.strong_skills),
      weak_skills:     safeStrArray(sa.weak_skills),
      missing_skills:  safeStrArray(sa.missing_skills),
    },
    project_analysis:    safeStr(r.project_analysis,    'No project analysis available.'),
    experience_analysis: safeStr(r.experience_analysis, 'No experience analysis available.'),
    ats_breakdown: {
      parsing_risk:       safeParsingRisk(atb.parsing_risk),
      keyword_density:    safeKeywordDensity(atb.keyword_density),
      formatting_issues:  safeStrArray(atb.formatting_issues),
      missing_keywords:   safeStrArray(atb.missing_keywords),
      ats_verdict:        safeStr(atb.ats_verdict, 'ATS compatibility analysis unavailable.'),
    },
    upgrade_insight: {
      action:                 safeStr(ui.action, 'Add quantified metrics to your bullet points.'),
      expected_score_increase: safeInt(ui.expected_score_increase, 5, 1, 30),
      reason:                 safeStr(ui.reason, 'Metrics demonstrate impact and make your resume stand out to recruiters.'),
    },
    competitive_position: safeStr(r.competitive_position, ''),
  };
}
