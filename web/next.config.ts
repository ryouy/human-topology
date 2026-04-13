import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** モノレポ直下をルートに据え、ファイルトレースと lockfile 解決を安定させる（Vercel の Root Directory が web のとき） */
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
