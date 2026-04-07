'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  CircleAlert as AlertCircle,
  CircleCheck as CheckCircle,
  TrendingUp,
  ArrowLeft,
  Loader as Loader2,
  Zap,
  ShieldAlert,
  Target,
  Brain,
  FileSearch,
  Trophy,
  XCircle,
  BarChart3,
  Briefcase,
} from 'lucide-react';
import type { AnalysisResult } from '@/lib/types';
import { normalizeAnalysisResult } from '@/lib/normalize';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Default case returns a valid object so profileColors.bg never crashes.
function getProfileColors(strength: AnalysisResult['profile_strength']) {
  switch (strength) {
    case 'Strong':  return { text: 'text-green-400',  border: 'border-green-500/20',  bg: 'bg-green-500/10'  };
    case 'Good':    return { text: 'text-yellow-400', border: 'border-yellow-500/20', bg: 'bg-yellow-500/10' };
    case 'Average': return { text: 'text-orange-400', border: 'border-orange-500/20', bg: 'bg-orange-500/10' };
    case 'Weak':    return { text: 'text-red-400',    border: 'border-red-500/20',    bg: 'bg-red-500/10'    };
    default:        return { text: 'text-slate-400',  border: 'border-slate-500/20',  bg: 'bg-slate-500/10'  };
  }
}

function getRiskColor(risk: string) {
  switch (risk) {
    case 'Critical': return 'text-red-400 bg-red-500/10 border-red-500/20';
    case 'High':     return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
    case 'Medium':   return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
    default:         return 'text-green-400 bg-green-500/10 border-green-500/20';
  }
}

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="font-semibold text-white">{score}</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

// ── Empty state for array sections ────────────────────────────────────────────
function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-slate-500 text-sm italic">{message}</p>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const [analysis, setAnalysis]       = useState<AnalysisResult | null>(null);
  const [progress, setProgress]       = useState(0);
  const [sessionError, setSessionError] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    try {
      // The dashboard stores 'analysis_result' before pushing to this page.
      // We no longer check 'resume_uploaded' — it was never set by the dashboard,
      // so that check permanently blocked access to this page.
      const stored = sessionStorage.getItem('analysis_result');

      if (!stored) {
        setSessionError(true);
        return;
      }

      // Parse then normalize — normalizeAnalysisResult is the contract enforcer.
      // Even if sessionStorage was tampered with or AI output was unexpected,
      // every field is guaranteed to be the correct type after this call.
      let parsed: unknown;
      try {
        parsed = JSON.parse(stored);
      } catch {
        setSessionError(true);
        return;
      }

      const safe = normalizeAnalysisResult(parsed);
      setAnalysis(safe);
      setIsTruncated(sessionStorage.getItem('analysis_truncated') === 'true');

      // Animate the score circle from 0 to final_score.
      // final_score is guaranteed to be an integer in [0, 100] after normalization,
      // so this interval is guaranteed to terminate.
      const target = safe.final_score; // already clamped to [0, 100]
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= target) {
            clearInterval(progressInterval);
            return target;
          }
          // Math.min prevents overshooting target (e.g. prev=71, target=72, step=2)
          return Math.min(prev + 2, target);
        });
      }, 30);

      return () => clearInterval(progressInterval);
    } catch {
      setSessionError(true);
    }
  }, []);

  // ── Error state ──────────────────────────────────────────────────────────────

  if (sessionError) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-orange-400" />
          </div>
          <h2 className="text-2xl font-bold mb-3">Session Expired</h2>
          <p className="text-slate-400 mb-6 leading-relaxed">
            Your results couldn&apos;t be loaded — this usually happens in private browsing
            or when navigating directly to this page. Upload your resume again to get your analysis.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-6 py-3 rounded-lg gradient-purple text-white font-semibold hover:opacity-90 transition-opacity"
          >
            Go Back &amp; Upload Resume
          </button>
        </div>
      </div>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────────

  if (!analysis) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-purple-500 animate-spin mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-2">Loading Results</h2>
          <p className="text-slate-400">Just a moment...</p>
        </div>
      </div>
    );
  }

  // After normalization every field is guaranteed to be safe — no optional
  // chaining or null guards needed in the render tree below, but we keep the
  // array .length checks so empty sections are hidden rather than rendering
  // blank cards.

  const profileColors = getProfileColors(analysis.profile_strength);
  const hasRedFlags   = analysis.red_flags.length > 0;

  return (
    <div className="min-h-screen bg-slate-950">

      {/* ── Nav ── */}
      <nav className="border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-purple-500" />
            <span className="text-xl font-bold gradient-text">ResumeRoast</span>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-6 md:space-y-8">

        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl md:text-4xl font-bold mb-2">Resume Analysis Results</h1>
          <p className="text-slate-400 text-base md:text-lg">Evaluated against top-25% competitive tech internship programs</p>
        </div>

        {/* Truncation warning */}
        {isTruncated && (
          <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
            <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-yellow-300 text-sm">
              <span className="font-semibold">Large resume detected.</span> Your file exceeded the analysis
              limit so only the first portion was evaluated. Keep your resume to 1 page — competitive
              internship programs prefer it and this tool is optimised for that.
            </p>
          </div>
        )}

        {/* ── Top Grid: Score Card + Issues + Action Plan ── */}
        <div className="grid lg:grid-cols-3 gap-6 md:gap-8">

          {/* Score Card */}
          <div className="lg:col-span-1">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 lg:sticky lg:top-6 space-y-6">

              {/* Circle */}
              <div className="flex flex-col items-center">
                <div className="relative w-36 h-36 md:w-48 md:h-48 mb-4">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 192 192">
                    <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="none" className="text-slate-800" />
                    <circle
                      cx="96" cy="96" r="88"
                      stroke="url(#gradient)"
                      strokeWidth="12"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 88}`}
                      strokeDashoffset={`${2 * Math.PI * 88 * (1 - progress / 100)}`}
                      className="transition-all duration-300"
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#7c3aed" />
                        <stop offset="100%" stopColor="#a855f7" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl md:text-5xl font-bold gradient-text">{progress}</span>
                    <span className="text-slate-400 text-sm">/100</span>
                  </div>
                </div>

                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${profileColors.bg} border ${profileColors.border}`}>
                  <CheckCircle className={`w-4 h-4 ${profileColors.text}`} />
                  <span className={`text-sm font-semibold ${profileColors.text}`}>{analysis.profile_strength} Profile</span>
                </div>
              </div>

              {/* Score Breakdown */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Score Breakdown</p>
                <ScoreBar label="Content Score" score={analysis.content_score} color="bg-purple-500" />
                <ScoreBar label="ATS Score"     score={analysis.ats_score}     color="bg-blue-500"   />
                <div className="pt-1 border-t border-slate-700">
                  <ScoreBar label="Final Score" score={analysis.final_score} color="bg-gradient-to-r from-purple-500 to-blue-500" />
                </div>
              </div>

              {/* Summary */}
              {analysis.summary && (
                <div className="pt-2 border-t border-slate-800">
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">Recruiter Verdict</p>
                  <p className="text-slate-300 text-sm leading-relaxed">{analysis.summary}</p>
                </div>
              )}
            </div>
          </div>

          {/* Issues + Action Plan */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">

            {/* Red Flags */}
            {hasRedFlags && (
              <div className="bg-red-950/40 border-2 border-red-500/40 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldAlert className="w-6 h-6 text-red-400" />
                  <h2 className="text-xl font-bold text-red-300">Red Flags — Fix Before Submitting</h2>
                </div>
                <p className="text-red-400/70 text-sm mb-4">
                  These will cause immediate rejection or destroy your credibility in a technical interview.
                </p>
                <div className="space-y-3">
                  {analysis.red_flags.map((flag, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-red-200 text-sm">{flag}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Issues */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <AlertCircle className="w-6 h-6 text-orange-400" />
                <h2 className="text-2xl font-bold">Top Issues to Fix</h2>
              </div>
              <div className="space-y-3">
                {analysis.issues.length > 0 ? (
                  analysis.issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-3 p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
                      <div className="w-6 h-6 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-orange-400">{i + 1}</span>
                      </div>
                      <p className="text-slate-300 text-sm">{issue}</p>
                    </div>
                  ))
                ) : (
                  <EmptyState message="No major issues detected." />
                )}
              </div>
            </div>

            {/* Action Plan */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <TrendingUp className="w-6 h-6 text-purple-400" />
                <h2 className="text-2xl font-bold">Action Plan</h2>
              </div>
              <div className="space-y-3">
                {analysis.action_plan.length > 0 ? (
                  analysis.action_plan.map((action, i) => (
                    <div key={i} className="flex items-start gap-3 p-4 bg-purple-500/5 border border-purple-500/20 rounded-lg hover:bg-purple-500/10 transition-colors">
                      <div className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-purple-300">{i + 1}</span>
                      </div>
                      <p className="text-slate-300 text-sm">{action}</p>
                    </div>
                  ))
                ) : (
                  <EmptyState message="No action items generated." />
                )}
              </div>
            </div>

            {/* Upgrade Insight */}
            <div className="bg-gradient-to-br from-purple-900/40 to-violet-900/40 border-2 border-purple-500/30 rounded-2xl p-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-6 h-6 text-purple-300" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">Highest-Impact Move</h3>
                  <p className="text-slate-300 leading-relaxed">
                    <span className="font-semibold text-purple-300">{analysis.upgrade_insight.action}</span>
                  </p>
                  <p className="text-sm text-slate-400 mt-2">{analysis.upgrade_insight.reason}</p>
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-purple-500/20 border border-purple-500/30 rounded-full">
                    <TrendingUp className="w-4 h-4 text-purple-300" />
                    <span className="text-sm font-semibold text-purple-300">
                      +{analysis.upgrade_insight.expected_score_increase} points
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── ATS Breakdown ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-6">
            <FileSearch className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl md:text-2xl font-bold">ATS Analysis</h2>
            <span className="text-sm text-slate-400">— how your resume survives automated filtering</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6">
            <div className={`p-4 rounded-xl border ${getRiskColor(analysis.ats_breakdown.parsing_risk)}`}>
              <p className="text-xs uppercase tracking-wider font-medium opacity-70 mb-1">Parsing Risk</p>
              <p className="text-lg font-bold">{analysis.ats_breakdown.parsing_risk}</p>
            </div>
            <div className="p-4 rounded-xl border border-slate-700 bg-slate-800/50">
              <p className="text-xs uppercase tracking-wider font-medium text-slate-500 mb-1">Keyword Density</p>
              <p className="text-lg font-bold text-white">{analysis.ats_breakdown.keyword_density}</p>
            </div>
            <div className="p-4 rounded-xl border border-slate-700 bg-slate-800/50">
              <p className="text-xs uppercase tracking-wider font-medium text-slate-500 mb-1">ATS Score</p>
              <p className="text-lg font-bold text-white">{analysis.ats_score}/100</p>
            </div>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl mb-6">
            <p className="text-blue-300 text-sm font-medium">{analysis.ats_breakdown.ats_verdict}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {analysis.ats_breakdown.formatting_issues.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-300 mb-3">Formatting Issues</p>
                <div className="space-y-2">
                  {analysis.ats_breakdown.formatting_issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-orange-300">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {analysis.ats_breakdown.missing_keywords.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-300 mb-3">Missing Keywords</p>
                <div className="flex flex-wrap gap-2">
                  {analysis.ats_breakdown.missing_keywords.map((kw, i) => (
                    <span key={i} className="px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded-md text-slate-400">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Skills Analysis ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <Brain className="w-6 h-6 text-purple-400" />
            <h2 className="text-xl md:text-2xl font-bold">Skills Analysis</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4 md:gap-6">

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-green-400" />
                <p className="text-sm font-semibold text-green-400">Demonstrated Skills</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.skills_analysis.strong_skills.length > 0 ? (
                  analysis.skills_analysis.strong_skills.map((s, i) => (
                    <span key={i} className="px-2 py-1 text-xs bg-green-500/10 border border-green-500/20 rounded-md text-green-300">{s}</span>
                  ))
                ) : (
                  <EmptyState message="None detected" />
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-yellow-400" />
                <p className="text-sm font-semibold text-yellow-400">Listed But Unproven</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.skills_analysis.weak_skills.length > 0 ? (
                  analysis.skills_analysis.weak_skills.map((s, i) => (
                    <span key={i} className="px-2 py-1 text-xs bg-yellow-500/10 border border-yellow-500/20 rounded-md text-yellow-300">{s}</span>
                  ))
                ) : (
                  <EmptyState message="None detected" />
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="w-4 h-4 text-red-400" />
                <p className="text-sm font-semibold text-red-400">Missing Skills</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.skills_analysis.missing_skills.length > 0 ? (
                  analysis.skills_analysis.missing_skills.map((s, i) => (
                    <span key={i} className="px-2 py-1 text-xs bg-red-500/10 border border-red-500/20 rounded-md text-red-300">{s}</span>
                  ))
                ) : (
                  <EmptyState message="None detected" />
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ── Project & Experience Analysis ── */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-8">

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-3 mb-4">
              <BarChart3 className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-bold">Project Analysis</h2>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">{analysis.project_analysis}</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-3 mb-4">
              <Briefcase className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-bold">Experience Analysis</h2>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">{analysis.experience_analysis}</p>
          </div>

        </div>

        {/* ── Competitive Position ── */}
        {analysis.competitive_position && (
          <div className="bg-slate-900 border border-purple-500/20 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-4">
              <Target className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-bold">Where You Stand</h2>
            </div>
            <p className="text-slate-300 leading-relaxed">{analysis.competitive_position}</p>
          </div>
        )}

        {/* ── Strengths ── */}
        {analysis.strengths.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <CheckCircle className="w-6 h-6 text-green-400" />
              <h2 className="text-2xl font-bold">What&apos;s Working</h2>
            </div>
            <div className="space-y-3">
              {analysis.strengths.map((strength, i) => (
                <div key={i} className="flex items-start gap-3 p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <p className="text-slate-300 text-sm">{strength}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
