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
  Radar,
  Siren,
  BadgeCheck,
} from 'lucide-react';
import type { AnalysisResult, RedFlag, HiringPrediction } from '@/lib/types';
import { normalizeAnalysisResult } from '@/lib/normalize';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Default case is required — getProfileColors must never return undefined.
function getProfileColors(strength: AnalysisResult['profile_strength']) {
  switch (strength) {
    case 'Strong':  return { text: 'text-green-400',  border: 'border-green-500/20',  bg: 'bg-green-500/10'  };
    case 'Good':    return { text: 'text-yellow-400', border: 'border-yellow-500/20', bg: 'bg-yellow-500/10' };
    case 'Average': return { text: 'text-orange-400', border: 'border-orange-500/20', bg: 'bg-orange-500/10' };
    case 'Weak':    return { text: 'text-red-400',    border: 'border-red-500/20',    bg: 'bg-red-500/10'    };
    default:        return { text: 'text-slate-400',  border: 'border-slate-500/20',  bg: 'bg-slate-500/10'  };
  }
}

function getOutcomeStyle(outcome: HiringPrediction['outcome']) {
  switch (outcome) {
    case 'Strong':   return { bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-300',  badge: 'bg-green-500/20 text-green-300'  };
    case 'Possible': return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-300', badge: 'bg-yellow-500/20 text-yellow-300' };
    case 'Unlikely': return { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-300', badge: 'bg-orange-500/20 text-orange-300' };
    case 'No':       return { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-300',    badge: 'bg-red-500/20 text-red-300'      };
    default:         return { bg: 'bg-slate-500/10',  border: 'border-slate-500/30',  text: 'text-slate-300',  badge: 'bg-slate-500/20 text-slate-300'  };
  }
}

function getTierLabel(tier: HiringPrediction['competitive_tier']) {
  switch (tier) {
    case 'FAANG':       return '🏆 FAANG-Competitive';
    case 'Top-50':      return '⭐ Top-50 Tech';
    case 'Mid-Market':  return '✅ Mid-Market Ready';
    case 'Startup-Only': return '🚀 Startup-Viable';
    case 'Not-Ready':   return '⛔ Not Interview-Ready';
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

function getRedFlagColor(severity: RedFlag['severity']) {
  switch (severity) {
    case 'Critical': return { row: 'bg-red-500/10 border-red-500/20',     icon: 'text-red-400',    badge: 'bg-red-500/20 text-red-300'    };
    case 'High':     return { row: 'bg-orange-500/10 border-orange-500/20', icon: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300' };
    case 'Medium':   return { row: 'bg-yellow-500/10 border-yellow-500/20', icon: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-300' };
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
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function DimensionBar({ label, score }: { label: string; score: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 45 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className={`font-semibold ${score >= 70 ? 'text-green-400' : score >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>{score}</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-slate-500 text-sm italic">{message}</p>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const [analysis, setAnalysis]           = useState<AnalysisResult | null>(null);
  const [progress, setProgress]           = useState(0);
  const [sessionError, setSessionError]   = useState(false);
  const [isTruncated, setIsTruncated]     = useState(false);
  const router = useRouter();

  useEffect(() => {
    try {
      // 'resume_uploaded' was never set by the dashboard — removed that dead check.
      // We gate on 'analysis_result' only.
      const stored = sessionStorage.getItem('analysis_result');
      if (!stored) { setSessionError(true); return; }

      let parsed: unknown;
      try { parsed = JSON.parse(stored); }
      catch { setSessionError(true); return; }

      // normalizeAnalysisResult on the client is a second defense layer.
      // The server already normalized, but sessionStorage could be tampered with.
      const safe = normalizeAnalysisResult(parsed);
      setAnalysis(safe);
      setIsTruncated(sessionStorage.getItem('analysis_truncated') === 'true');

      // Animate score. final_score is guaranteed [0, 100] after normalization.
      const target = safe.final_score;
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= target) { clearInterval(interval); return target; }
          return Math.min(prev + 2, target); // prevents overshooting
        });
      }, 30);

      return () => clearInterval(interval);
    } catch {
      setSessionError(true);
    }
  }, []);

  // ── Error state ───────────────────────────────────────────────────────────────

  if (sessionError) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-orange-400" />
          </div>
          <h2 className="text-2xl font-bold mb-3">Session Expired</h2>
          <p className="text-slate-400 mb-6 leading-relaxed">
            Your results couldn&apos;t be loaded — this usually happens in private browsing or when navigating
            directly to this page. Upload your resume again to get your analysis.
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

  // All fields are safe after normalization.
  const profileColors  = getProfileColors(analysis.profile_strength);
  const outcomeStyle   = getOutcomeStyle(analysis.hiring_prediction.outcome);
  const criticalFlags  = analysis.red_flags.filter((f) => f.severity === 'Critical');
  const otherFlags     = analysis.red_flags.filter((f) => f.severity !== 'Critical');
  const hasCritical    = criticalFlags.length > 0;

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
          <p className="text-slate-400 text-base md:text-lg">
            Evaluated as a{' '}
            <span className="text-white font-semibold">{analysis.detected_role}</span> resume
            {analysis.role_confidence < 60 && (
              <span className="text-yellow-400 text-sm ml-2">(role detected with low confidence — advice may need adjustment)</span>
            )}
          </p>
        </div>

        {/* Truncation warning */}
        {isTruncated && (
          <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
            <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-yellow-300 text-sm">
              <span className="font-semibold">Large resume detected.</span> Only the first portion was
              analyzed. Keep your resume to 1 page — competitive internship programs prefer it.
            </p>
          </div>
        )}

        {/* Career pivot warning */}
        {analysis.is_career_pivot && (
          <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
            <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-blue-300 text-sm font-semibold mb-1">Career Pivot Detected</p>
              <p className="text-blue-300/80 text-sm">
                Your work history doesn&apos;t align with your apparent target role. This is a reframing
                problem, not a polish problem. The advice below targets that gap specifically.
              </p>
            </div>
          </div>
        )}

        {/* ── HIRING PREDICTION — shown first. This is the product's core value. ── */}
        <div className={`rounded-2xl border-2 p-6 md:p-8 ${outcomeStyle.bg} ${outcomeStyle.border}`}>
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div className="flex items-center gap-3">
              <Radar className={`w-7 h-7 ${outcomeStyle.text}`} />
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-1">Hiring Prediction</p>
                <div className="flex items-center gap-3">
                  <span className={`text-2xl font-bold ${outcomeStyle.text}`}>
                    {analysis.hiring_prediction.outcome === 'Strong'   && 'Strong Candidate'}
                    {analysis.hiring_prediction.outcome === 'Possible' && 'Possible Candidate'}
                    {analysis.hiring_prediction.outcome === 'Unlikely' && 'Unlikely to Get Interviews'}
                    {analysis.hiring_prediction.outcome === 'No'       && 'Not Interview-Ready'}
                  </span>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${outcomeStyle.badge}`}>
                    {getTierLabel(analysis.hiring_prediction.competitive_tier)}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 mb-1">ATS Pass Rate</p>
              <p className={`text-3xl font-bold ${outcomeStyle.text}`}>{analysis.hiring_prediction.screen_pass_rate}%</p>
            </div>
          </div>
          <p className={`mt-4 text-sm leading-relaxed font-medium ${outcomeStyle.text}`}>
            {analysis.hiring_prediction.verdict}
          </p>
        </div>

        {/* ── CRITICAL RED FLAGS — binary rejection triggers shown before the score ── */}
        {hasCritical && (
          <div className="bg-red-950/40 border-2 border-red-500/40 rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-3 mb-3">
              <Siren className="w-6 h-6 text-red-400" />
              <h2 className="text-xl font-bold text-red-300">Critical Issues — Fix Before Applying</h2>
            </div>
            <p className="text-red-400/70 text-sm mb-5">
              These are automatic disqualifiers. Applying before fixing these wastes every application.
            </p>
            <div className="space-y-3">
              {criticalFlags.map((flag, i) => {
                const colors = getRedFlagColor(flag.severity);
                return (
                  <div key={i} className={`flex items-start gap-3 p-4 border rounded-xl ${colors.row}`}>
                    <XCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${colors.icon}`} />
                    <div>
                      <p className={`font-semibold text-sm ${colors.icon}`}>{flag.flag}</p>
                      <p className="text-slate-400 text-xs mt-1">{flag.impact}</p>
                    </div>
                    <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${colors.badge}`}>
                      {flag.severity}
                    </span>
                  </div>
                );
              })}
            </div>
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

              {/* Aggregate scores */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Score Breakdown</p>
                <ScoreBar label="Content Score" score={analysis.content_score} color="bg-purple-500" />
                <ScoreBar label="ATS Score"     score={analysis.ats_score}     color="bg-blue-500"   />
                <div className="pt-1 border-t border-slate-700">
                  <ScoreBar label="Final Score" score={analysis.final_score} color="bg-gradient-to-r from-purple-500 to-blue-500" />
                </div>
              </div>

              {/* Dimension scores */}
              <div className="space-y-2.5 pt-2 border-t border-slate-800">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">6 Dimensions</p>
                <DimensionBar label="Technical Depth"       score={analysis.dimension_scores.technical_depth}      />
                <DimensionBar label="Project Impact"        score={analysis.dimension_scores.project_impact}       />
                <DimensionBar label="Experience Relevance"  score={analysis.dimension_scores.experience_relevance} />
                <DimensionBar label="ATS Compatibility"     score={analysis.dimension_scores.ats_compatibility}    />
                <DimensionBar label="Narrative Clarity"     score={analysis.dimension_scores.narrative_clarity}    />
                <DimensionBar label="Completeness"          score={analysis.dimension_scores.completeness}         />
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

            {/* Top Priority — pulled out explicitly so it doesn't get buried */}
            <div className="bg-gradient-to-br from-purple-900/40 to-violet-900/40 border-2 border-purple-500/30 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-purple-300" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-1">Top Priority</p>
                  <p className="text-purple-200 font-semibold text-base leading-snug">{analysis.top_priority}</p>
                </div>
              </div>
            </div>

            {/* Other red flags (non-critical) */}
            {otherFlags.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8">
                <div className="flex items-center gap-3 mb-5">
                  <ShieldAlert className="w-6 h-6 text-orange-400" />
                  <h2 className="text-xl font-bold">Additional Flags</h2>
                </div>
                <div className="space-y-3">
                  {otherFlags.map((flag, i) => {
                    const colors = getRedFlagColor(flag.severity);
                    return (
                      <div key={i} className={`flex items-start gap-3 p-3 border rounded-lg ${colors.row}`}>
                        <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${colors.icon}`} />
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${colors.icon}`}>{flag.flag}</p>
                          <p className="text-slate-500 text-xs mt-0.5">{flag.impact}</p>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${colors.badge}`}>
                          {flag.severity}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Issues */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <AlertCircle className="w-6 h-6 text-orange-400" />
                <h2 className="text-2xl font-bold">Issues to Fix</h2>
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
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-6 h-6 text-purple-400" />
                <h2 className="text-2xl font-bold">Action Plan</h2>
              </div>
              <p className="text-slate-500 text-xs mb-5">Ordered by hiring impact — #1 matters most</p>
              <div className="space-y-3">
                {analysis.action_plan.length > 0 ? (
                  analysis.action_plan.map((action, i) => (
                    <div key={i} className={`flex items-start gap-3 p-4 border rounded-lg transition-colors hover:bg-purple-500/10 ${i === 0 ? 'bg-purple-500/10 border-purple-500/30' : 'bg-purple-500/5 border-purple-500/20'}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${i === 0 ? 'bg-purple-500/40 border-purple-400/50 border' : 'bg-purple-500/20 border-purple-500/30 border'}`}>
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
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                  <BadgeCheck className="w-6 h-6 text-blue-300" />
                </div>
                <div>
                  <h3 className="text-lg font-bold mb-1">Highest-Impact Change</h3>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    <span className="font-semibold text-blue-300">{analysis.upgrade_insight.action}</span>
                  </p>
                  <p className="text-sm text-slate-400 mt-2">{analysis.upgrade_insight.reason}</p>
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 border border-blue-500/30 rounded-full">
                    <TrendingUp className="w-4 h-4 text-blue-300" />
                    <span className="text-sm font-semibold text-blue-300">
                      +{analysis.upgrade_insight.expected_score_increase} pts
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
                    <span key={i} className="px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded-md text-slate-400">{kw}</span>
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
                <p className="text-sm font-semibold text-green-400">Demonstrated</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.skills_analysis.strong_skills.length > 0 ? (
                  analysis.skills_analysis.strong_skills.map((s, i) => (
                    <span key={i} className="px-2 py-1 text-xs bg-green-500/10 border border-green-500/20 rounded-md text-green-300">{s}</span>
                  ))
                ) : <EmptyState message="None detected" />}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-yellow-400" />
                <p className="text-sm font-semibold text-yellow-400">Listed, Not Proven</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.skills_analysis.weak_skills.length > 0 ? (
                  analysis.skills_analysis.weak_skills.map((s, i) => (
                    <span key={i} className="px-2 py-1 text-xs bg-yellow-500/10 border border-yellow-500/20 rounded-md text-yellow-300">{s}</span>
                  ))
                ) : <EmptyState message="None detected" />}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="w-4 h-4 text-red-400" />
                <p className="text-sm font-semibold text-red-400">Missing</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.skills_analysis.missing_skills.length > 0 ? (
                  analysis.skills_analysis.missing_skills.map((s, i) => (
                    <span key={i} className="px-2 py-1 text-xs bg-red-500/10 border border-red-500/20 rounded-md text-red-300">{s}</span>
                  ))
                ) : <EmptyState message="None detected" />}
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
