// Next.js dev sunucusunu ve Python dekont-okuma servisini tek terminalde,
// tek komutla (npm run dev:full) başlatır. Ekstra bağımlılık gerektirmez —
// Node'un kendi child_process'i yeterli. WAHA'ya dahil değil; o Docker'da
// `--restart unless-stopped` ile zaten kalıcı çalışıyor.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const kokDizin = process.cwd();

// .env.local'i bu sürece de yükle: Next kendi değişkenlerini zaten okuyor ama
// alt süreç olarak başlattığımız uvicorn onları görmüyor. Dekont servisi
// DEKONT_SERVICE_KEY olmadan istek kabul etmediği için (fail-closed) anahtarın
// buraya taşınması şart.
try {
  process.loadEnvFile(path.join(kokDizin, ".env.local"));
} catch {
  // .env.local yoksa sorun değil; aşağıdaki kontrol uyarıyı basar.
}
const pyDizin = path.join(kokDizin, "python-dekont-servisi");
const winMi = process.platform === "win32";
const uvicorn = path.join(pyDizin, ".venv", winMi ? "Scripts" : "bin", winMi ? "uvicorn.exe" : "uvicorn");

if (!existsSync(uvicorn)) {
  console.error(
    "python-dekont-servisi/.venv bulunamadı. Önce kurun:\n\n" +
      "  cd python-dekont-servisi\n" +
      "  python -m venv .venv\n" +
      "  " + (winMi ? ".venv\\Scripts\\pip" : ".venv/bin/pip") + " install -r requirements.txt\n",
  );
  process.exit(1);
}

function calistir(etiket, komut, args, cwd, ekOrtam = {}) {
  const surec = spawn(komut, args, {
    cwd,
    shell: winMi,
    env: { ...process.env, ...ekOrtam },
  });
  const yazdir = (veri) =>
    veri
      .toString()
      .split("\n")
      .filter((satir) => satir.trim())
      .forEach((satir) => console.log(`[${etiket}] ${satir}`));

  surec.stdout.on("data", yazdir);
  surec.stderr.on("data", yazdir);
  surec.on("exit", (kod) => console.log(`[${etiket}] kapandı (kod ${kod})`));
  return surec;
}

if (!process.env.DEKONT_SERVICE_KEY) {
  console.error(
    "DEKONT_SERVICE_KEY tanımlı değil. Dekont servisi anahtarsız istek kabul\n" +
      "etmez; .env.local dosyanıza rastgele bir değer ekleyin:\n\n" +
      "  DEKONT_SERVICE_KEY=herhangi-bir-rastgele-dize\n",
  );
  process.exit(1);
}

const nextSurec = calistir("next", "npx", ["next", "dev", "-p", "3100"], kokDizin);
const pySurec = calistir("dekont", uvicorn, ["main:app", "--port", "8000"], pyDizin, {
  DEKONT_SERVICE_KEY: process.env.DEKONT_SERVICE_KEY,
});

function kapat() {
  nextSurec.kill();
  pySurec.kill();
  process.exit(0);
}

process.on("SIGINT", kapat);
process.on("SIGTERM", kapat);
