'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { APIResponse } from '@/lib/types';
import Link from 'next/link';
import {
  Sparkles,
  LayoutDashboard,
  FileText,
  Target,
  Settings,
  Upload,
  LogOut,
  X,
  Loader
} from 'lucide-react';

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function validateFile(file: File): string | null {
  if (file.type !== 'application/pdf') return 'Only PDF files are accepted.';
  if (file.size > MAX_FILE_SIZE_BYTES) return `File exceeds ${MAX_FILE_SIZE_MB}MB limit.`;
  return null;
}

export default function DashboardPage() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  // `status` drives all post-submission UI. Replaces the boolean `isAnalyzing`
  // so the button disappears after success instead of staying clickable.
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'done'>('idle');
  const [extractedPreview, setExtractedPreview] = useState<string | null>(null);
  // Synchronous ref lock — React state updates are async so a boolean state flag
  // can be read as `false` by a second click before the first setState commits.
  // The ref write is immediate and visible to any concurrent call.
  const isAnalyzingRef = useRef(false);
  const router = useRouter();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    // Use the ref — not status state — because state reads here are stale closures.
    // A drop during an in-flight request would swap uploadedFile while the fetch
    // is bound to the old FormData, causing preview text to mismatch the filename.
    if (isAnalyzingRef.current) return;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const error = validateFile(file);
    if (error) { setFileError(error); return; }
    setFileError(null);
    setExtractedPreview(null);
    setStatus('idle');
    setUploadedFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateFile(file);
    if (error) {
      setFileError(error);
      e.target.value = '';
      return;
    }
    setFileError(null);
    setExtractedPreview(null);
    setStatus('idle');
    setUploadedFile(file);
  };

  // Single entry point for all analysis triggers (button click AND drag-drop).
  // Centralising here means the lock, cleanup, and state transitions can never
  // drift between the two call sites.
  const startAnalysis = async (file: File) => {
    // Fix 1 — synchronous ref check. React state (`status`) is async: a second
    // click can read stale `idle` before the first setState('analyzing') commits.
    // The ref write on the next line is immediate and shared across closures.
    if (isAnalyzingRef.current) return;
    isAnalyzingRef.current = true;

    setStatus('analyzing');
    setFileError(null);
    setExtractedPreview(null); // Fix 3 — clear stale preview before new request

    // Abort the request if it hasn't completed within 12s.
    // Vercel Hobby hard-kills functions at 10s — if that happens it returns a
    // Vercel HTML 504 page, not JSON. Without this controller the spinner hangs
    // forever because response.json() throws on HTML but the catch only fires
    // after the default browser fetch timeout (which can be minutes).
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 12000);

    try {
      const formData = new FormData();
      formData.append('file', file); // uses the parameter, not captured state

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      // Vercel 504 / edge errors return HTML, not JSON — guard before parsing.
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        setFileError('Analysis timed out. Please try again — large PDFs occasionally take longer.');
        setStatus('idle');
        return;
      }

      // Fix 6 — separate try/catch around JSON parse. Content-type can be
      // application/json while the body is still malformed (CDN error pages).
      // Without this, a SyntaxError propagates to the outer catch and shows
      // "Network error" which is the wrong message for this failure.
      let data: APIResponse;
      try {
        data = await response.json();
      } catch {
        setFileError('Server returned an unreadable response. Please try again.');
        setStatus('idle');
        return;
      }

      // Debug: confirm exact response shape — remove after AI is stable
      console.log('API response:', data);

      // HTTP-level errors (400, 422, 429, 500) — all return ErrorResponse shape
      if (!response.ok) {
        // Safely extract error message — data.ok is false for all backend errors
        const msg = !data.ok ? data.error : null;
        if (response.status === 429) {
          setFileError(msg ?? 'High demand right now. Please try again in a few minutes.');
        } else {
          setFileError(msg ?? 'Analysis failed. Please try again.');
        }
        setStatus('idle');
        return;
      }

      // API-level failure on a 200 (defensive — backend should not do this, but guard it)
      if (!data.ok) {
        setFileError(data.error ?? 'Analysis failed. Please try again.');
        setStatus('idle');
        return;
      }

      // Branch on mode — the single source of truth for what shape to expect
      if (data.mode === 'extraction') {
        if (!data.preview_text) {
          // ok:true + mode:extraction but no text — backend emitted a partial response
          setFileError('Extraction returned no text. Try re-exporting your PDF.');
          setStatus('idle');
          return;
        }
        setExtractedPreview(data.preview_text);
        setStatus('done'); // Fix 5 — 'done' hides the Analyze button
        return;
      }

      if (data.mode === 'analysis') {
        if (!data.analysis) {
          // mode declares analysis but field is absent — backend bug, surface it cleanly
          setFileError('Analysis result was incomplete. Please try again.');
          setStatus('idle');
          return;
        }
        sessionStorage.setItem('resume_uploaded', 'true');
        sessionStorage.setItem('analysis_result', JSON.stringify(data.analysis));
        sessionStorage.setItem('analysis_truncated', data.truncated ? 'true' : 'false');
        router.push('/results');
        return;
      }

      // Unknown mode — future-proofing: don't crash silently if backend adds a new mode
      setFileError('Unexpected response from server. Please try again.');
      setStatus('idle');

    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setFileError('Analysis timed out. Please try again — large PDFs occasionally take longer.');
      } else {
        setFileError('Network error. Make sure you are connected and try again.');
      }
      setStatus('idle');
    } finally {
      // Fix 2 — guaranteed cleanup regardless of which path exits the try block.
      // Previously clearTimeout was duplicated in try + catch; a thrown exception
      // in the try block after the fetch resolved would skip the try-side call
      // and leak the timer until it fired and aborted a completed request.
      clearTimeout(abortTimer);
      isAnalyzingRef.current = false;
    }
  };

  const handleLogOut = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row">

      {/* ── Mobile top bar (hidden on desktop) ── */}
      <header className="md:hidden flex items-center justify-between px-4 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-purple-500" />
          <span className="text-lg font-bold gradient-text">ResumeRoast</span>
        </div>
        <button
          onClick={handleLogOut}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <LogOut className="w-4 h-4" />
          Exit
        </button>
      </header>

      {/* ── Sidebar (hidden on mobile) ── */}
      <aside className="hidden md:flex w-64 border-r border-slate-800 flex-col">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-purple-500" />
            <span className="text-xl font-bold gradient-text">ResumeRoast</span>
          </div>
        </div>

        <nav className="flex-1 p-4">
          <div className="space-y-1">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-purple-600/10 text-purple-400 font-medium transition-colors"
            >
              <LayoutDashboard className="w-5 h-5" />
              Dashboard
            </Link>
            <button disabled className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-600 cursor-not-allowed w-full">
              <FileText className="w-5 h-5" />
              My Resumes
            </button>
            <button disabled className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-600 cursor-not-allowed w-full">
              <Target className="w-5 h-5" />
              Matches
            </button>
            <button disabled className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-600 cursor-not-allowed w-full">
              <Settings className="w-5 h-5" />
              Settings
            </button>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogOut}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors w-full"
          >
            <LogOut className="w-5 h-5" />
            Log Out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
          <div className="mb-6 md:mb-8">
            <h1 className="text-2xl md:text-4xl font-bold mb-2">Upload Your Resume</h1>
            <p className="text-slate-400 text-base md:text-lg">
              Get instant AI-powered feedback and discover your best internship matches
            </p>
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-2xl p-8 md:p-12 transition-all ${
              isDragging
                ? 'border-purple-500 bg-purple-500/5'
                : 'border-slate-700 hover:border-slate-600'
            }`}
          >
            <input
              type="file"
              id="resume-upload"
              accept=".pdf"
              onChange={handleFileChange}
              className="hidden"
              disabled={status === 'analyzing'}
            />

            {!uploadedFile ? (
              <label
                htmlFor="resume-upload"
                className="flex flex-col items-center justify-center cursor-pointer"
              >
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                  <Upload className="w-7 h-7 md:w-8 md:h-8 text-purple-400" />
                </div>
                <h3 className="text-base md:text-xl font-semibold mb-2 text-center">
                  Tap to browse or drop your resume
                </h3>
                <p className="text-slate-400 text-sm">PDF format only • Max 10MB</p>
              </label>
            ) : (
              <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{uploadedFile.name}</p>
                    <p className="text-sm text-slate-400">
                      {(uploadedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                {status !== 'analyzing' && (
                  <button
                    onClick={() => { setUploadedFile(null); setStatus('idle'); setExtractedPreview(null); }}
                    className="w-8 h-8 rounded-full hover:bg-slate-700 flex items-center justify-center transition-colors flex-shrink-0 ml-2"
                  >
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                )}
              </div>
            )}
          </div>

          {fileError && (
            <p className="mt-3 text-sm text-red-400 text-center">{fileError}</p>
          )}

          {extractedPreview && (
            <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
              <p className="text-sm font-semibold text-green-400 mb-2">✓ Resume text extracted — AI scoring coming shortly</p>
              <p className="text-xs text-slate-400 whitespace-pre-wrap line-clamp-4">{extractedPreview}</p>
              <p className="text-xs text-slate-500 mt-2">This is a preview of the extracted text. Full analysis will appear here once AI is enabled.</p>
            </div>
          )}

          {/* Fix 5 — status-driven button. `idle` = ready, `analyzing` = locked
               spinner, `done` = Analyze Again (resets to idle so user can retry
               without having to pick a new file). The Analyze button is NEVER
               shown while `done` — that was the bug causing the stale re-click. */}
          {uploadedFile && status === 'idle' && (
            <button
              onClick={() => startAnalysis(uploadedFile)}
              className="w-full mt-6 py-4 rounded-lg gradient-purple text-white font-semibold text-lg hover:opacity-90 transition-opacity shadow-lg shadow-purple-500/30 flex items-center justify-center gap-3"
            >
              Analyze My Resume
            </button>
          )}

          {status === 'analyzing' && (
            <button
              disabled
              className="w-full mt-6 py-4 rounded-lg gradient-purple text-white font-semibold text-lg opacity-60 cursor-not-allowed flex items-center justify-center gap-3"
            >
              <Loader className="w-5 h-5 animate-spin" />
              Analyzing your resume...
            </button>
          )}

          {uploadedFile && status === 'done' && (
            <button
              onClick={() => setStatus('idle')}
              className="w-full mt-6 py-4 rounded-lg border border-purple-500/40 text-purple-400 font-semibold text-lg hover:bg-purple-500/10 transition-colors flex items-center justify-center gap-3"
            >
              Analyze Again
            </button>
          )}

          {status === 'analyzing' && (
            <p className="text-center text-slate-400 text-sm mt-3">
              Extracting text and running AI analysis — usually done in under 10 seconds
            </p>
          )}

          <div className="mt-8 md:mt-12 grid md:grid-cols-2 gap-4 md:gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 md:p-6">
              <div className="w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                <Target className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Instant Analysis</h3>
              <p className="text-slate-400 text-sm">
                Get your resume score and detailed feedback in seconds
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 md:p-6">
              <div className="w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Smart Matching</h3>
              <p className="text-slate-400 text-sm">
                Discover internships where you have the highest chances
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
