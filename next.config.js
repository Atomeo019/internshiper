/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  experimental: {
    // Tell Next.js NOT to bundle pdf-parse — let Node.js require it at runtime.
    // Without this, Vercel's serverless bundler mangles the pdf-parse internals
    // and causes "Error at /var/task/.next/server/" crashes.
    serverComponentsExternalPackages: ['pdf-parse'],
  },
};

module.exports = nextConfig;
