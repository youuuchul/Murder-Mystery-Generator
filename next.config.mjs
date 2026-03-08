/** @type {import('next').NextConfig} */
const nextConfig = {
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
