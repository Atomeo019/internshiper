/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  experimental: {
    // Keep pdfjs-dist out of the serverless bundle — let Node.js handle it at runtime.
    serverComponentsExternalPackages: ['pdfjs-dist'],
  },
  webpack: (config) => {
    // pdfjs-dist optionally imports 'canvas' for Node.js rendering.
    // We don't need canvas (text extraction only), so stub it out to prevent
    // webpack from erroring on the missing native module.
    config.resolve.alias.canvas = false;
    return config;
  },
};

module.exports = nextConfig;
