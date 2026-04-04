/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // pdfjs-dist uses relative require('./pdf.worker.js') internally at runtime.
  // When webpack bundles pdfjs-dist into a server chunk, that relative path can't
  // be resolved — causing "Setting up fake worker failed: Cannot find module './pdf.worker.js'".
  // Externalizing pdfjs-dist tells Next.js to skip bundling it and let Node.js
  // native require() handle it instead, which resolves relative paths correctly.
  experimental: {
    serverComponentsExternalPackages: ['pdfjs-dist'],
  },
  webpack: (config) => {
    // pdfjs-dist optionally imports 'canvas' for Node.js rendering (graphics only).
    // We use pdfjs for text extraction only, so canvas is not needed.
    // Aliasing to false tells webpack to replace 'canvas' with an empty stub,
    // which prevents the "Module not found: Can't resolve 'canvas'" build error.
    // pdfjs-dist's internal try-catch handles the empty stub gracefully.
    config.resolve.alias.canvas = false;
    return config;
  },
};

module.exports = nextConfig;
