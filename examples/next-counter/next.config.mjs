/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@tschk/moonshine",
    "@tschk/moonshine-next",
    "@tschk/moonshine-shaders",
  ],
};

export default nextConfig;
