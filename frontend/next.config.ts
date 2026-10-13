import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Cần cho image Docker (sao chép .next/standalone). Dev (`next dev`) không đổi.
  output: "standalone",
};

export default nextConfig;

