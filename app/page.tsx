import Link from 'next/link';
import { ArrowRight, Sparkles, Target, TrendingUp, Zap } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950">
      <nav className="border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-7 h-7 text-purple-500" />
              <span className="text-xl font-bold gradient-text">Internshiper</span>
            </div>
            <Link
              href="/dashboard"
              className="px-4 py-2 text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-slate-950 to-slate-950" />
          <div className="absolute inset-0">
            <div className="absolute top-20 left-20 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-20 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-7xl mx-auto px-6 pt-32 pb-24">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 mb-8">
                <Zap className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-purple-300">AI-Powered Resume Analysis</span>
              </div>

              <h1 className="text-6xl md:text-7xl font-bold mb-6 leading-tight">
                Know Your Shortlisting{' '}
                <span className="gradient-text">Probability</span>{' '}
                Before You Apply
              </h1>

              <p className="text-xl text-slate-400 mb-12 leading-relaxed max-w-2xl mx-auto">
                AI-powered resume scoring and internship matching built for college students.
                Get instant feedback and know exactly what to improve.
              </p>

              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-lg gradient-purple text-white font-semibold text-lg hover:opacity-90 transition-opacity shadow-lg shadow-purple-500/30"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5" />
              </Link>

              <p className="text-sm text-slate-500 mt-4">
                No credit card required • Instant results
              </p>
            </div>
          </div>
        </section>

        <section className="py-24 border-t border-slate-800">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid md:grid-cols-3 gap-12">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 mb-6">
                  <Target className="w-8 h-8 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Instant Resume Score</h3>
                <p className="text-slate-400">
                  Get a detailed score of your resume strength with AI-powered analysis in seconds.
                </p>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 mb-6">
                  <TrendingUp className="w-8 h-8 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Actionable Insights</h3>
                <p className="text-slate-400">
                  Receive specific recommendations to improve your resume and increase your chances.
                </p>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 mb-6">
                  <Sparkles className="w-8 h-8 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Smart Matching</h3>
                <p className="text-slate-400">
                  Discover internships where you have the highest probability of getting shortlisted.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 py-8">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-slate-500 text-sm">
            © {new Date().getFullYear()} Internshiper. Built for college students.
          </p>
        </div>
      </footer>
    </div>
  );
}
