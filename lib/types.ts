// Shared types used by both the API route (server) and results page (client).
// Keeping this in lib/types.ts prevents the client bundle from accidentally
// importing the API route module (which pulls in pdf-parse → pdfjs-dist →
// pdf.worker.js) and crashing with a client-side exception.

// ── API Response Contract ─────────────────────────────────────────────────────

export type APIErrorCode =
  | 'NO_FILE'
  | 'INVALID_PDF'
  | 'PDF_ENCRYPTED'
  | 'PARSE_FAILED'
  | 'PARSER_UNAVAILABLE'
  | 'AI_FAILED'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR';

export type ErrorResponse = {
  ok: false;
  mode: 'error';
  error: string;
  code: APIErrorCode;
};

export type ExtractionResponse = {
  ok: true;
  mode: 'extraction';
  full_text_length: number;
  preview_text: string;
  truncated: false;
  elapsed_ms: number;
};

export type AnalysisResponse = {
  ok: true;
  mode: 'analysis';
  full_text_length: number;
  preview_text: string;
  truncated: boolean;
  elapsed_ms: number;
  analysis: AnalysisResult;
};

export type APIResponse = ExtractionResponse | AnalysisResponse | ErrorResponse;

// ── Red Flag ──────────────────────────────────────────────────────────────────
// A string is not enough — severity drives UI priority and score caps.
// Critical = immediate rejection trigger. High = strong disadvantage. Medium = notable gap.

export interface RedFlag {
  flag: string;     // the specific problem, no softening
  severity: 'Critical' | 'High' | 'Medium';
  impact: string;   // the concrete hiring consequence
}

// ── Dimension Scores ──────────────────────────────────────────────────────────
// Six independent axes. The aggregate score hides where the real problem is.
// Showing dimensions lets the user know exactly where to spend the next hour.

export interface DimensionScores {
  technical_depth:       number;  // code complexity, CS fundamentals, tooling depth
  project_impact:        number;  // scale, measurable outcome, individual contribution
  experience_relevance:  number;  // how relevant past roles are to the target role
  ats_compatibility:     number;  // formatting, keywords, parseability
  narrative_clarity:     number;  // action verbs, specificity, no fluff
  completeness:          number;  // required sections present and populated
}

// ── Hiring Prediction ─────────────────────────────────────────────────────────
// This is the output users actually care about: will they get hired or not.
// "You scored 67" is academic. "Unlikely to pass FAANG screening" is actionable.

export interface HiringPrediction {
  outcome: 'Strong' | 'Possible' | 'Unlikely' | 'No';
  screen_pass_rate: number;   // estimated % of applications that clear ATS
  competitive_tier: 'FAANG' | 'Top-50' | 'Mid-Market' | 'Startup-Only' | 'Not-Ready';
  verdict: string;            // one specific, unambiguous sentence
}

// ── Analysis Result ───────────────────────────────────────────────────────────

export interface AnalysisResult {
  // Role detection — must happen before scoring. Wrong role = wrong advice.
  detected_role: string;    // 'SWE' | 'Data' | 'DevOps' | 'PM' | 'Design' | 'IT-Ops' | 'Career-Pivot' | 'Unknown'
  role_confidence: number;  // 0-100. If < 60, advice carries a caveat.
  is_career_pivot: boolean; // triggers a different feedback path entirely

  // Hiring outcome — shown first in UI. This is the product's core value.
  hiring_prediction: HiringPrediction;

  // Scores — the aggregate AND the breakdown
  final_score: number;
  dimension_scores: DimensionScores;

  // Kept for backward compat with ScoreBar components
  content_score: number;
  ats_score: number;

  has_metrics: boolean;
  profile_strength: 'Weak' | 'Average' | 'Good' | 'Strong';
  summary: string;

  // Red flags as structured objects — severity drives both UI and score caps
  red_flags: RedFlag[];

  strengths: string[];
  issues: string[];
  action_plan: string[];  // ordered by impact, not importance — item 1 matters most
  top_priority: string;   // single highest-leverage action, pulled out explicitly

  skills_analysis: {
    strong_skills: string[];   // backed by project/work evidence
    weak_skills: string[];     // listed but not demonstrated
    missing_skills: string[];  // important skills absent — verified against resume text
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
