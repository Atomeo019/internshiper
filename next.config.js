/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  experimental: {
    // pdf-parse uses pdfjs-dist internally. If webpack bundles either of them,
    // the pdfjs worker (pdf.worker.js) can't be resolved at runtime on Vercel.
    // Externalizing keeps them in node_modules where Node.js require() can find
    // all files including the worker — no bundling, no path resolution issues.
    serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  },
};

module.exports = nextConfig;
