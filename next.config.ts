import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Home dizininde alakasız bir package-lock.json var; onu kök sanmasın diye
  // proje kökünü açıkça bildiriyoruz (deploy'da dosya izleme hatasını önler).
  outputFileTracingRoot: path.resolve(process.cwd()),
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
