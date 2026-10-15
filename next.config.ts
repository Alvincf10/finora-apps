import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phone / LAN testing of `next dev` (Add to Home Screen needs the host)
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.local"],
};

export default nextConfig;
