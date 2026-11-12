import { readFileSync } from 'node:fs';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Tauri Phase 0: emit a self-contained server under .next/standalone.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // Never trace the Tauri runtime/shell back into .next/standalone.
  outputFileTracingExcludes: {
    '*': [
      './desktop-runtime/**',
      './src-tauri/**',
      './collector/**',
      './tauri-ui/**',
      './backups/**',
    ],
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
};

export default nextConfig;
