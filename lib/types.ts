// Shared types used by both the API route (server) and results page (client).
// Keeping this in lib/types.ts prevents the client bundle from accidentally
// importing the API route module (which pulls in pdf-parse → pdfjs-dist →
// pdf.worker.js) and crashing with a client-side exception.

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
