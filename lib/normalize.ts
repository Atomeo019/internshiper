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
// Two layers:
//   1. Exact substring match (case-insensitive)
//   2. Semantic equivalences — "containerization" is present if "docker" is found
//
// Add new equivalences here when the AI invents new generic-vs-specific mappings.

const SEMANTIC_EQUIVALENCES: Record<string, string[]> = {
  'containerization':    ['docker', 'podman', 'containerd', 'kubernetes'],
  'cloud computing':     ['aws', 'gcp', 'azure', 'google cloud', 'amazon web services', 'heroku', 'digitalocean'],
  'agile methodologies': ['agile', 'scrum', 'kanban', 'sprint', 'jira'],
  'agile':               ['scrum', 'kanban', 'sprint'],
  'ci/cd':               ['github actions', 'gitlab ci', 'jenkins', 'circleci', 'travis', 'pipeline'],
  'devops':              ['docker', 'kubernetes', 'github actions', 'jenkins', 'terraform', 'ansible'],
  'version control':     ['git', 'github', 'gitlab', 'bitbucket'],
  'machine learning':    ['pytorch', 'tensorflow', 'scikit', 'sklearn', 'numpy', 'regression', 'classification', 'clustering'],
  'data structures':     ['linked list', 'binary tree', 'heap', 'graph', 'dsa', 'leetcode'],
  'testing':             ['jest', 'pytest', 'junit', 'mocha', 'cypress', 'unit test', 'test'],
};

function filterHallucinatedMissingSkills(skills: string[], resumeText: string): string[] {
  const textLower = resumeText.toLowerCase();

  return skills.filter((skill) => {
    const normalized = skill.toLowerCase().replace(/[.\-_]/g, ' ').trim();

    // Layer 1: exact substring
    if (textLower.includes(normalized)) return false;

    // Layer 2: semantic equivalences
    const alts = SEMANTIC_EQUIVALENCES[normalized];
    if (alts && alts.some((alt) => textLower.includes(alt))) return false;

    return true;
  });
}

// ── Circular action plan filter ───────────────────────────────────────────────
// The AI cannot reliably detect that the user is already doing what it suggests.
// We enforce the rules in code so the model can't override them.
//
// Rule 1: "apply/pursue/seek internships" is ALWAYS circular.
//   - If the user is a student seeking internships → they are literally already doing this.
//   - If they're a professional → they don't want an internship.
//   Either way: useless advice. Filter it unconditionally.
//
// Rule 2: "create a portfolio / personal website" when projects already exist.
//   - Only filter when project_impact > 20 (they demonstrably have projects).
//
// Rule 3: "develop a personal project" when projects already exist.
//   - Only filter when project_impact > 30 (substantial project history).

const CIRCULAR_INTERNSHIP_RE =
  /\b(apply|pursue|seek|get|land|secure|find|obtain|gain)\b[^.]*\b(internships?|co-?ops?)\b/i;

const CIRCULAR_PORTFOLIO_RE =
  /\b(create|build|make|develop|set up|start|launch|establish)\b[^.]*\b(portfolio|personal\s+website|personal\s+site|portfolio\s+site)\b/i;

const CIRCULAR_PROJECT_RE =
  /\b(develop|build|create|work on|start)\b[^.]*\b(personal\s+project|side\s+project|project|projects)\b[^.]*\b(showcases?|demonstrates?|highlights?|skills?|expertise)\b/i;

// "Network with professionals" = unmeasurable, unactionable, always filtered.
// Catches: "network with", "reach out to professionals", "connect with industry", "seek mentorship/guidance"
const VAGUE_NETWORKING_RE =
  /\b(network|networking)\b[^.]*\b(professional|industry|peers|community|employer)\b|\battend\b[^.]*\b(networking|meetup|conference)\b|\b(reach out|connect)\b[^.]*\b(professionals?|industry|mentors?|experts?|people)\b|\bseek\s+(mentorship|guidance|advice)\s+from\b/i;

// "Review and improve resume formatting" = circular (the tool is already doing this).
// "Prepare for interview questions" = premature when they haven't landed an interview yet.
const VAGUE_META_ACTION_RE =
  /\breview\b[^.]*\b(resume|cv)\b[^.]*\b(formatting|content|presentation|structure)\b|\b(prepare|practice)\b[^.]*\b(interview questions?|common questions?|answering|mock interview)\b/i;

// Red flags that are tautologically true for every entry-level/internship candidate.
// "Lack of industry experience" is expected for someone seeking their first internship —
// flagging it adds zero information and makes the tool look out of touch.
const STUDENT_TAUTOLOGY_FLAG_RE =
  /\b(lack|limited|absence|no)\b[^.]{0,40}\b(direct |industry |professional |full.?time |work )*(experience|exposure|background)\b|\bno full.?time\b/i;

const CIRCULAR_UPGRADE_ACTION_FALLBACK = 'Add measurable outcomes to your existing project descriptions (e.g., "reduced latency by 40%").';

function filterCircularActionPlan(
  items: string[],
  rawTopPriority: string,
  rawUpgradeAction: string,
  dims: DimensionScores,
): { items: string[]; topPriority: string; upgradeAction: string } {
  const shouldDrop = (item: string): boolean => {
    // Always drop internship-seeking advice
    if (CIRCULAR_INTERNSHIP_RE.test(item)) return true;
    // Drop "build a portfolio" if they already have projects
    if (dims.project_impact > 20 && CIRCULAR_PORTFOLIO_RE.test(item)) return true;
    // Drop "develop a personal project" if they already have substantial projects
    if (dims.project_impact > 30 && CIRCULAR_PROJECT_RE.test(item)) return true;
    // Always drop vague networking advice — unmeasurable, unactionable
    if (VAGUE_NETWORKING_RE.test(item)) return true;
    // Drop meta-circular actions: "review your resume" / "prepare for interview questions"
    if (VAGUE_META_ACTION_RE.test(item)) return true;
    return false;
  };

  const filtered = items.filter((item) => !shouldDrop(item));

  // If top_priority was circular, replace it with the first surviving item
  const topPriority = shouldDrop(rawTopPriority)
    ? (filtered[0] ?? rawTopPriority)
    : rawTopPriority;

  // upgrade_insight.action bypasses the main filter — run it through too
  const upgradeAction = shouldDrop(rawUpgradeAction)
    ? CIRCULAR_UPGRADE_ACTION_FALLBACK
    : rawUpgradeAction;

  return { items: filtered, topPriority, upgradeAction };
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

// Profile strength is derived from score first, then capped to match
// the final hiring outcome — they must tell the same story.
// "Strong Profile" + "Possible Candidate" is a contradiction users catch instantly.
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

// After finalOutcome is resolved, cap profileStrength so it can't be higher
// than what the outcome implies. Outcome is the pessimistic merge of rule-based
// and AI — it's the more trustworthy signal. Profile strength must agree.
const OUTCOME_STRENGTH_CAP: Record<
  HiringPrediction['outcome'],
  AnalysisResult['profile_strength']
> = {
  Strong:   'Strong',
  Possible: 'Good',    // "Possible" outcome → profile can be at most "Good", never "Strong"
  Unlikely: 'Average',
  No:       'Weak',
};

const PROFILE_RANK: Record<AnalysisResult['profile_strength'], number> = {
  Strong: 3, Good: 2, Average: 1, Weak: 0,
};

function capProfileToOutcome(
  strength: AnalysisResult['profile_strength'],
  outcome: HiringPrediction['outcome'],
): AnalysisResult['profile_strength'] {
  const cap = OUTCOME_STRENGTH_CAP[outcome];
  return PROFILE_RANK[strength] <= PROFILE_RANK[cap] ? strength : cap;
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
    .filter((f): f is RedFlag => f !== null)
    // Drop tautological entry-level flags — "no industry experience" is expected for every
    // internship seeker; showing it makes the tool look tone-deaf.
    .filter((f) => !STUDENT_TAUTOLOGY_FLAG_RE.test(f.flag));

  // ── Career pivot ────────────────────────────────────────────────────────────
  const isCareerPivot = safeBool(r.is_career_pivot, false);

  // ── Base scores ─────────────────────────────────────────────────────────────
  const rawContent = safeInt(r.content_score, 50);
  const atsScore   = safeInt(r.ats_score,     40);
  // Derive final from components — AI arithmetic is unreliable
  const rawFinal   = Math.round(rawContent * 0.6 + atsScore * 0.4);

  // ── Anti-inflation caps ──────────────────────────────────────────────────────
  const { finalScore, contentScore } = applyScoreCaps(rawFinal, rawContent, dims, redFlags, isCareerPivot);

  // ── Profile strength — derived from score, then capped after outcome is known ─
  const profileStrengthRaw = deriveProfileStrength(finalScore, redFlags);

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

  // Cap profile strength now that finalOutcome is resolved.
  // This prevents "Strong Profile" + "Possible Candidate" contradictions.
  const profileStrength = capProfileToOutcome(profileStrengthRaw, finalOutcome);

  // ── Circular advice filter — runs AFTER all other normalization ───────────────
  // Computed here so the variables are available to assign directly in the return.
  // upgrade_insight.action is extracted before calling filterCircularActionPlan so
  // it can be run through the same shouldDrop logic — it previously bypassed all filters.
  const rawActionPlan    = safeStrArray(r.action_plan);
  const rawTopPriority   = safeStr(r.top_priority, rawActionPlan[0] ?? 'Review the issues listed below.');
  const rawUpgradeAction = safeStr(ui.action, 'Add quantified metrics to your bullet points.');
  const {
    items: cleanActionPlan,
    topPriority: cleanTopPriority,
    upgradeAction: cleanUpgradeAction,
  } = filterCircularActionPlan(rawActionPlan, rawTopPriority, rawUpgradeAction, dims);

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
    action_plan:      cleanActionPlan,
    top_priority:     cleanTopPriority,
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
      // Apply the same hallucination filter used for missing_skills — "Cloud Computing"
      // must not appear if "AWS" or any specific cloud provider is in the resume text.
      missing_keywords: resumeText
        ? filterHallucinatedMissingSkills(safeStrArray(atb.missing_keywords), resumeText)
        : safeStrArray(atb.missing_keywords),
      ats_verdict:       safeStr(atb.ats_verdict, 'ATS compatibility analysis unavailable.'),
    },
    upgrade_insight: {
      action:                  cleanUpgradeAction,
      expected_score_increase: safeInt(ui.expected_score_increase, 5, 1, 20),
      reason:                  safeStr(ui.reason, 'Metrics demonstrate impact and make your resume stand out.'),
    },
    competitive_position: safeStr(r.competitive_position, ''),
  };
}
