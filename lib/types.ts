// Shared types used by both the API route (server) and results page (client).
// Keeping this in lib/types.ts prevents the client bundle from accidentally
// importing the API route module (which pulls in pdf-parse → pdfjs-dist →
// pdf.worker.js) and crashing with a client-side exception.

// ── API Response Contract ─────────────────────────────────────────────────────
// The `mode` discriminator tells the frontend exactly what shape to expect.
// NEVER return a success response without a mode field — it forces explicit
// handling on the frontend and prevents silent breakage when AI is toggled.

export type APIErrorCode =
  | 'NO_FILE'        // file field missing from form data
  | 'INVALID_PDF'    // file doesn't start with %PDF header
  | 'PDF_ENCRYPTED'  // password-protected PDF
  | 'PARSE_FAILED'   // both pdf-parse and regex fallback returned < 20 chars
  | 'PARSER_UNAVAILABLE' // require('pdf-parse') didn't return a function
  | 'AI_FAILED'      // Groq call threw or returned unparseable JSON
  | 'RATE_LIMITED'   // too many requests
  | 'SERVER_ERROR';  // unhandled exception

export type ErrorResponse = {
  ok: false;
  mode: 'error';
  error: string;       // human-readable message for display
  code: APIErrorCode;  // machine-readable for frontend branching
};

// Extraction-only mode: AI disabled, returns raw text preview for verification
export type ExtractionResponse = {
  ok: true;
  mode: 'extraction';
  full_text_length: number; // full extracted char count — NOT the preview length
  preview_text: string;     // first 500 chars only — intentionally partial
  truncated: false;         // always false in extraction mode, no AI truncation
  elapsed_ms: number;
};

// Full analysis mode: AI enabled, returns complete scored result
export type AnalysisResponse = {
  ok: true;
  mode: 'analysis';
  full_text_length: number;
  preview_text: string;
  truncated: boolean;      // true if resumeText was trimmed before sending to AI
  elapsed_ms: number;
  analysis: AnalysisResult;
};

export type APIResponse = ExtractionResponse | AnalysisResponse | ErrorResponse;

// ── Resume Analysis Result ────────────────────────────────────────────────────

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
