import { readFileSync } from 'node:fs';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow an atomic deploy: build into a staging dir while the old server runs.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
};

export default nextConfig;
