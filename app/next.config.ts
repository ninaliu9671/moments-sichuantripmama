import type { NextConfig } from "next";

// Serverless deployment (CloudBase static hosting + cloud function).
// MOMENTS_TARGET=serverless builds the front end as a static export and drops
// every server-only module: the API lives in a cloud function instead. The
// default keeps the self-contained standalone server for local use and for
// container hosts such as CloudBase Cloud Run.
const serverless = process.env.MOMENTS_TARGET === 'serverless';

const serverHeaders = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
];

const nextConfig: NextConfig = {
  distDir: process.env.MOMENTS_BUILD_DIR || '.next',
  output: serverless ? 'export' : 'standalone',
  trailingSlash: serverless,
  images: { unoptimized: true },
  serverExternalPackages: serverless ? [] : ['@cloudbase/node-sdk', 'pg'],
  poweredByHeader: false,
  ...(serverless ? {} : { async headers() { return [{ source: '/:path*', headers: serverHeaders }]; } }),
};

export default nextConfig;
