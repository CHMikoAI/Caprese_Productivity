import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The pantry art resolver (src/lib/pantryArt.ts) checks public/pantry at
  // request time to prefer hand-made PNGs over the bundled SVGs. Include the
  // folder in the server trace so that fs check also works on serverless
  // hosts like Vercel, where public/ is otherwise only on the CDN.
  outputFileTracingIncludes: {
    "/*": ["./public/pantry/**/*"],
  },
};

export default nextConfig;
