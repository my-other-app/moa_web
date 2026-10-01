import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source rather than a build artefact, so
  // Next compiles them with the app. This keeps the shared UI editable without
  // a watch/rebuild step between packages and apps.
  transpilePackages: ["@moa/ui", "@moa/api", "@moa/auth", "@moa/app-kit"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    // Club logos, avatars and badge art are served from the API's S3 bucket.
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.myotherapp.in" },
    ],
  },
};

export default nextConfig;
