import type { NextConfig } from "next";

// Circle's wallets SDK ships an ESM build without "type": "module"; loading it as
// an external package crashes on Vercel's Node runtime, so it stays bundled.
const nextConfig: NextConfig = {
  // The job board was retired; old links land on the home page.
  redirects: async () => [{ source: "/jobs", destination: "/", permanent: false }],
};

export default nextConfig;
