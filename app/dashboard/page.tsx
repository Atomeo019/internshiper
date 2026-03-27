'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  LayoutDashboard,
  FileText,
  Target,
  Settings,
  Upload,
  LogOut,
  X
} from 'lucide-react';

export default function DashboardPage() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
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
    if (file && file.type === 'application/pdf') {
      setUploadedFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
    }
  };

  const handleAnalyze = () => {
    if (uploadedFile) {
      router.push('/results');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex">
      <aside className="w-64 border-r border-slate-800 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-purple-500" />
            <span className="text-xl font-bold gradient-text">Internshiper</span>
          </div>
        </div>

        <nav className="flex-1 p-4">
          <div className="space-y-1">
            <a
              href="#"
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-purple-600/10 text-purple-400 font-medium transition-colors"
            >
              <LayoutDashboard className="w-5 h-5" />
              Dashboard
            </a>
            <a
              href="#"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
            >
              <FileText className="w-5 h-5" />
              My Resumes
            </a>
            <a
              href="#"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
            >
              <Target className="w-5 h-5" />
              Matches
            </a>
            <a
              href="#"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
            >
              <Settings className="w-5 h-5" />
              Settings
            </a>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors w-full">
            <LogOut className="w-5 h-5" />
            Log Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-8 py-12">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Upload Your Resume</h1>
            <p className="text-slate-400 text-lg">
              Get instant AI-powered feedback and discover your best internship matches
            </p>
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-2xl p-12 transition-all ${
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
            />

            {!uploadedFile ? (
              <label
                htmlFor="resume-upload"
                className="flex flex-col items-center justify-center cursor-pointer"
              >
                <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                  <Upload className="w-8 h-8 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2">
                  Drop your resume here or click to browse
                </h3>
                <p className="text-slate-400 text-sm">
                  PDF format only • Max 10MB
                </p>
              </label>
            ) : (
              <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="font-medium">{uploadedFile.name}</p>
                    <p className="text-sm text-slate-400">
                      {(uploadedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setUploadedFile(null)}
                  className="w-8 h-8 rounded-full hover:bg-slate-700 flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            )}
          </div>

          {uploadedFile && (
            <button
              onClick={handleAnalyze}
              className="w-full mt-6 py-4 rounded-lg gradient-purple text-white font-semibold text-lg hover:opacity-90 transition-opacity shadow-lg shadow-purple-500/30"
            >
              Analyze My Resume
            </button>
          )}

          <div className="mt-12 grid md:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <div className="w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                <Target className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Instant Analysis</h3>
              <p className="text-slate-400 text-sm">
                Get your resume score and detailed feedback in seconds
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
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
