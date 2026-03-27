'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, CircleAlert as AlertCircle, CircleCheck as CheckCircle, TrendingUp, Building2, ArrowLeft, Loader as Loader2, Zap } from 'lucide-react';

const mockIssues = [
  'No quantified achievements',
  'Missing key technical skills',
  'Projects section too vague'
];

const mockActionPlan = [
  'Add numbers to your experience bullets',
  'List tools like React, Python, SQL explicitly',
  'Describe project impact not just features',
  'Add a skills summary section at the top'
];

const mockInternships = [
  {
    title: 'Software Engineering Intern',
    company: 'Google',
    match: 92,
    reason: 'Your Python and data structures background is a strong fit'
  },
  {
    title: 'Frontend Developer Intern',
    company: 'Meta',
    match: 88,
    reason: 'React experience aligns well with their tech stack'
  },
  {
    title: 'Data Science Intern',
    company: 'Microsoft',
    match: 85,
    reason: 'Your analytics projects match their requirements'
  },
  {
    title: 'Full Stack Intern',
    company: 'Amazon',
    match: 82,
    reason: 'Strong technical foundation and project portfolio'
  },
  {
    title: 'Machine Learning Intern',
    company: 'Apple',
    match: 78,
    reason: 'ML coursework and relevant project experience'
  }
];

export default function ResultsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 84) {
          clearInterval(progressInterval);
          return 84;
        }
        return prev + 2;
      });
    }, 50);

    return () => {
      clearTimeout(timer);
      clearInterval(progressInterval);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-purple-500 animate-spin mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-2">Analyzing Your Resume</h2>
          <p className="text-slate-400">This will only take a moment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <nav className="border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Dashboard
            </button>
            <div className="flex items-center gap-2">
              <Sparkles className="w-7 h-7 text-purple-500" />
              <span className="text-xl font-bold gradient-text">Internshiper</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-2">Resume Analysis Results</h1>
          <p className="text-slate-400 text-lg">
            Here's your detailed resume breakdown and personalized recommendations
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-1">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 sticky top-6">
              <div className="flex flex-col items-center">
                <div className="relative w-48 h-48 mb-6">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="96"
                      cy="96"
                      r="88"
                      stroke="currentColor"
                      strokeWidth="12"
                      fill="none"
                      className="text-slate-800"
                    />
                    <circle
                      cx="96"
                      cy="96"
                      r="88"
                      stroke="url(#gradient)"
                      strokeWidth="12"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 88}`}
                      strokeDashoffset={`${2 * Math.PI * 88 * (1 - progress / 100)}`}
                      className="transition-all duration-500"
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#7c3aed" />
                        <stop offset="100%" stopColor="#a855f7" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-bold gradient-text">{progress}</span>
                    <span className="text-slate-400 text-sm">/100</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-green-400">Strong Profile</span>
                  </div>
                  <p className="text-slate-400 text-sm mt-2">
                    Your resume is performing well, with room for improvement
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <AlertCircle className="w-6 h-6 text-orange-400" />
                <h2 className="text-2xl font-bold">Top Issues to Fix</h2>
              </div>
              <div className="space-y-3">
                {mockIssues.map((issue, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-4 bg-slate-800/50 border border-slate-700 rounded-lg"
                  >
                    <div className="w-6 h-6 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-orange-400">{index + 1}</span>
                    </div>
                    <p className="text-slate-300">{issue}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <TrendingUp className="w-6 h-6 text-purple-400" />
                <h2 className="text-2xl font-bold">Action Plan</h2>
              </div>
              <div className="space-y-3">
                {mockActionPlan.map((action, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-4 bg-purple-500/5 border border-purple-500/20 rounded-lg hover:bg-purple-500/10 transition-colors"
                  >
                    <CheckCircle className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                    <p className="text-slate-300">{action}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-900/40 to-violet-900/40 border-2 border-purple-500/30 rounded-2xl p-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-6 h-6 text-purple-300" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">Upgrade Insight</h3>
                  <p className="text-slate-300 leading-relaxed">
                    If you add <span className="font-semibold text-purple-300">2 quantified achievements</span>,
                    your score increases from{' '}
                    <span className="font-semibold text-white">84 to 93</span>
                  </p>
                  <p className="text-sm text-purple-300 mt-3">
                    This single improvement could boost your shortlisting probability by 15%
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-8">
            <Building2 className="w-6 h-6 text-purple-400" />
            <h2 className="text-2xl font-bold">Your Best Internship Matches</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mockInternships.map((internship, index) => (
              <div
                key={index}
                className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 hover:border-purple-500/30 hover:bg-slate-800 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-purple-400" />
                  </div>
                  <div className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/30">
                    <span className="text-sm font-bold text-purple-300">{internship.match}%</span>
                  </div>
                </div>
                <h3 className="font-semibold mb-1">{internship.title}</h3>
                <p className="text-purple-400 text-sm mb-3">{internship.company}</p>
                <p className="text-slate-400 text-sm">{internship.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
