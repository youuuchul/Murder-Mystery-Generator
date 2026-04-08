/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next.js 14에서는 instrumentation.ts 실행을 명시적으로 켜야 한다.
    instrumentationHook: true,
  },
  // SQLite는 서버 전용, 클라이언트 번들에서 제외
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        "better-sqlite3": false,
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

export default nextConfig;
