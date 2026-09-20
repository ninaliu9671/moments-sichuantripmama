import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.MOMENTS_BUILD_DIR || '.next',
  output: 'standalone',
  serverExternalPackages: ['@cloudbase/node-sdk', 'pg'],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
    ] }];
  },
};

export default nextConfig;
