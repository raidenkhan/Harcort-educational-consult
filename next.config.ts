import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // The project lives inside C:\Users\User; without this Next.js walks up to
  // the home directory looking for workspace roots (it finds a stray
  // package-lock.json there), which breaks file discovery such as
  // middleware.ts. Pin both roots to the project directory.
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
