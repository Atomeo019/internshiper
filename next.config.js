/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
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
