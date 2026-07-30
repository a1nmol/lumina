import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The template-rendering pipeline (src/lib/templates/render.ts) ships
  // native Node addons (@resvg/resvg-js's .node binding, sharp's libvips
  // binding) that Turbopack's server bundler cannot place in an ESM chunk.
  // Marking them external tells Next.js to `require()` them at runtime
  // instead of bundling — the standard fix for native addons in server code.
  serverExternalPackages: ["@resvg/resvg-js", "sharp"],
};

export default nextConfig;
