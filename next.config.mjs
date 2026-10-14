/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output so we can run the built Next server from Electron.
  output: 'standalone',
  webpack: (config, { isServer }) => {
    // Exclude @xenova/transformers binary files from webpack processing
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    // Exclude all files from @xenova/transformers
    config.module.rules.push({
      test: /node_modules\/@xenova\/transformers/,
      loader: 'ignore-loader',
    });

    // Handle .node files (for ONNX Runtime used by kokoro-js)
    config.module.rules.push({
      test: /\.node$/,
      use: 'node-loader',
    });

    // Also exclude any .bin or model files
    config.module.rules.push({
      test: /\.(bin|onnx|msgpack)$/,
      type: 'asset/resource',
    });

    return config;
  },
  experimental: {
    // Phase 1 adds better-sqlite3 (native) — keep it external to the bundle so
    // its native binding resolves at runtime instead of being webpacked.
    // (@xenova/transformers + onnxruntime-node were already external.)
    serverComponentsExternalPackages: [
      '@xenova/transformers',
      'onnxruntime-node',
      'better-sqlite3',
      // Pre-existing build break (independent of Phase 1): these document
      // parsers are only used via dynamic import() inside file-processing.ts,
      // but webpack still tries to bundle them for the server-action graph,
      // pulling in `underscore`'s ESM modules that the default loader cannot
      // parse. Marking them external keeps them as runtime requires and
      // unblocks both `next dev` and `next build`.
      'mammoth',
      'pdf-parse',
    ],
  },
};

export default nextConfig;
