import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kendi sunucumuzda Docker içinde koşuyoruz: standalone çıktı, çalışmak için
  // gereken node_modules'ü kendi içine kopyalar. İmaj küçülür ve runner
  // aşamasına npm install taşımaya gerek kalmaz.
  output: "standalone",
  // Home dizininde alakasız bir package-lock.json var; onu kök sanmasın diye
  // proje kökünü açıkça bildiriyoruz (deploy'da dosya izleme hatasını önler).
  outputFileTracingRoot: path.resolve(process.cwd()),
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
