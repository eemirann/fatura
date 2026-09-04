// Next.js dev sunucusunu ve Python dekont-okuma servisini tek terminalde,
// tek komutla (npm run dev:full) başlatır. Ekstra bağımlılık gerektirmez —
// Node'un kendi child_process'i yeterli. WAHA'ya dahil değil; o Docker'da
// `--restart unless-stopped` ile zaten kalıcı çalışıyor.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const kokDizin = process.cwd();
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

function calistir(etiket, komut, args, cwd) {
  const surec = spawn(komut, args, { cwd, shell: winMi });
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

const nextSurec = calistir("next", "npx", ["next", "dev"], kokDizin);
const pySurec = calistir("dekont", uvicorn, ["main:app", "--port", "8000"], pyDizin);

function kapat() {
  nextSurec.kill();
  pySurec.kill();
  process.exit(0);
}

process.on("SIGINT", kapat);
process.on("SIGTERM", kapat);
