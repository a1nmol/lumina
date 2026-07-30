import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The template-rendering pipeline (src/lib/templates/render.ts) ships
  // native Node addons (@resvg/resvg-js's .node binding, sharp's libvips
  // binding) that Turbopack's server bundler cannot place in an ESM chunk.
  // Marking them external tells Next.js to `require()` them at runtime
  // instead of bundling — the standard fix for native addons in server code.
  serverExternalPackages: ["@resvg/resvg-js", "sharp"],
  // The Inter TTFs are read from the filesystem at runtime by the template
  // renderer (satori needs raw font buffers, so they can't be imported as
  // modules). Vercel's output tracing only ships files it can statically
  // see — without this include, production lambdas were missing the fonts,
  // TemplateFontsMissingError fired on every render, and the studio's
  // silent fallback served the old raw-diffusion posters (diagnosed live:
  // works locally / slop in prod).
  outputFileTracingIncludes: {
    "/**": ["./src/lib/templates/fonts/*.ttf", "./src/lib/templates/fonts/*.otf"],
  },
};

export default nextConfig;
