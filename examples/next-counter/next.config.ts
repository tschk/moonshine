import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tschk/moonshine", "@tschk/moonshine-next", "@tschk/moonshine-shaders"],
};

export default nextConfig;
