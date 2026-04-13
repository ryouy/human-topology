import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * ローカルではリポジトリ直下をトレースして lockfile 警告を抑える。
   * Vercel（Root Directory = web）では単一アプリとしてビルドするため付けない。
   * 親ディレクトリをトレースするとサーバーレスバンドルが欠け、本番で / が 404 になることがある。
   */
  ...(process.env.VERCEL
    ? {}
    : { outputFileTracingRoot: path.join(__dirname, "..") }),
};

export default nextConfig;
