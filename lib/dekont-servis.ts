import "server-only";
import * as z from "zod/v4";

/** Claude'un dekonttan çıkaracağı alanlar — python-dekont-servisi/sema.py ile aynı sözleşme. */
export const DekontSemasi = z.object({
  okunabilir: z.boolean(),
  tutar: z.number().nullable(),
  para_birimi: z.string().nullable(),
  tarih: z.string().nullable(),
  alici_iban: z.string().nullable(),
  alici_ad: z.string().nullable(),
  gonderen_ad: z.string().nullable(),
  banka: z.string().nullable(),
  aciklama: z.string(),
});

export type DekontOkuma = z.infer<typeof DekontSemasi>;

const GORSEL_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export type DesteklenenMime = (typeof GORSEL_MIME)[number] | "application/pdf";

export function mimeDesteklenirMi(mime: string): mime is DesteklenenMime {
  return mime === "application/pdf" || (GORSEL_MIME as readonly string[]).includes(mime);
}

const AZAMI_BOYUT = 10 * 1024 * 1024; // 10 MB

/**
 * Dekont okuma işini Python mikroservisine (python-dekont-servisi) devreder.
 * Yanıt şekli lib/dekont-oku.ts'teki Claude sözleşmesiyle birebir aynıdır;
 * eşleştirme (esles.ts), DB ve UI bu dosyayı hiç tanımak zorunda değil.
 */
export async function dekontOku(
  dosya: Buffer,
  mime: DesteklenenMime,
): Promise<DekontOkuma> {
  const servisUrl = process.env.DEKONT_SERVIS_URL;
  if (!servisUrl) {
    throw new Error("DEKONT_SERVIS_URL ayarlanmamış — dekont okuma servisi bilinmiyor.");
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(dosya)], { type: mime }),
    "dekont." + uzanti(mime),
  );

  const basliklar: Record<string, string> = {};
  const servisKey = process.env.DEKONT_SERVICE_KEY;
  if (servisKey) basliklar["X-Service-Key"] = servisKey;

  const yanit = await fetch(servisUrl.replace(/\/+$/, "") + "/dekont-oku", {
    method: "POST",
    body: form,
    headers: basliklar,
    signal: AbortSignal.timeout(55_000), // ingest route maxDuration 60s'nin altında kalsın
  });

  if (!yanit.ok) {
    const detay = await yanit.text().catch(() => "");
    throw new Error(`Dekont servisi hata döndürdü (${yanit.status}): ${detay.slice(0, 300)}`);
  }

  const veri = DekontSemasi.safeParse(await yanit.json());
  if (!veri.success) {
    throw new Error("Dekont servisi beklenmeyen biçimde yanıt verdi.");
  }

  return veri.data;
}

function uzanti(mime: DesteklenenMime): string {
  return mime === "application/pdf"
    ? "pdf"
    : GORSEL_MIME.includes(mime as (typeof GORSEL_MIME)[number])
      ? (mime.split("/")[1] ?? "bin")
      : "bin";
}
