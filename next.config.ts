import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // QR koda na natisnjenem kvizu je zapisana z velikimi črkami (manj gosta koda): /R/<SEJA>/<UČENEC> → /r/…
  async rewrites() {
    return [{ source: '/R/:session/:student', destination: '/r/:session/:student' }];
  },
};

export default nextConfig;
