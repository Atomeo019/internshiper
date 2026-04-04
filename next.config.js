/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  experimental: {
    // pdf-parse ships its own bundled pdfjs v1.x inside lib/pdf.js/{version}/build/.
    // It loads them with a template literal: require(`./pdf.js/${version}/build/pdf.js`)
    // Webpack can't statically trace template literals, so those files never get
    // bundled. Vercel's output file tracer also misses them for the same reason.
    //
    // Two-part fix:
    // 1. serverComponentsExternalPackages — prevents webpack from touching pdf-parse
    //    at all. Node.js native require() handles it, resolving relative paths
    //    correctly from node_modules/pdf-parse/lib/.
    // 2. outputFileTracingIncludes — force Vercel to ship all of pdf-parse's
    //    bundled pdfjs files so they exist on disk at /var/task/node_modules/ when
    //    the serverless function runs.
    serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist'],
    outputFileTracingIncludes: {
      '/api/analyze': [
        // pdf-parse ships pdfjs v1.x via template literal requires — tracer misses them
        './node_modules/pdf-parse/lib/**/*',
        // pdfjs-dist legacy build — used as fallback when pdf-parse fails on valid PDFs
        // (e.g. ReportLab-generated PDFs that trigger false-positive XRef errors in pdfjs v1.x)
        './node_modules/pdfjs-dist/legacy/build/**/*',
      ],
    },
  },
};

module.exports = nextConfig;
