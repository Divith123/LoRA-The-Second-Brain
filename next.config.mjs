/** @type {import('next').NextConfig} */
const nextConfig = {
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
    serverComponentsExternalPackages: ['@xenova/transformers', 'onnxruntime-node'],
  },
};

export default nextConfig;
