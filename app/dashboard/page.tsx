'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Analyzing your resume...');
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
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const error = validateFile(file);
    if (error) { setFileError(error); return; }
    setFileError(null);
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
    setUploadedFile(file);
  };

  const handleAnalyze = async () => {
    if (!uploadedFile || isAnalyzing) return;

    setIsAnalyzing(true);
    setFileError(null);
    setLoadingMessage('Analyzing your resume...');

    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt === 2) setLoadingMessage('Still working on it...');
        if (attempt === 3) setLoadingMessage('Almost there, one moment...');

        const formData = new FormData();
        formData.append('file', uploadedFile);

        const response = await fetch('/api/analyze', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        // Hard errors (bad file, invalid PDF) — don't retry, tell user immediately
        if (response.status === 400 || response.status === 422) {
          setFileError(result.error || 'Could not read your PDF. Make sure it is not a scanned image.');
          setIsAnalyzing(false);
          return;
        }

        if (!response.ok || !result.success) {
          // Soft error (Groq timeout, 500) — retry silently
          if (attempt < MAX_RETRIES) continue;
          setFileError('Analysis failed after multiple attempts. Please try again in a moment.');
          setIsAnalyzing(false);
          return;
        }

        // Success
        sessionStorage.setItem('resume_uploaded', 'true');
        sessionStorage.setItem('analysis_result', JSON.stringify(result.analysis));
        sessionStorage.setItem('analysis_truncated', result.truncated ? 'true' : 'false');
        router.push('/results');
        return;

      } catch {
        // Network error — retry silently
        if (attempt < MAX_RETRIES) {
          await new Promise(res => setTimeout(res, 1000));
          continue;
        }
        setFileError('Network error. Make sure you are connected and try again.');
        setIsAnalyzing(false);
        return;
      }
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
              disabled={isAnalyzing}
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
                {!isAnalyzing && (
                  <button
                    onClick={() => setUploadedFile(null)}
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

          {uploadedFile && (
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="w-full mt-6 py-4 rounded-lg gradient-purple text-white font-semibold text-lg hover:opacity-90 transition-opacity shadow-lg shadow-purple-500/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {isAnalyzing ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  {loadingMessage}
                </>
              ) : (
                'Analyze My Resume'
              )}
            </button>
          )}

          {isAnalyzing && (
            <p className="text-center text-slate-400 text-sm mt-3">
              Extracting text and running AI analysis — this takes about 15 seconds
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
