import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";

/** Claude'un dekonttan çıkaracağı alanlar. */
export const DekontSemasi = z.object({
  okunabilir: z
    .boolean()
    .describe(
      "Bu dosya bir para transferi dekontu/makbuzu mu ve tutarı net okunabiliyor mu?",
    ),
  tutar: z
    .number()
    .nullable()
    .describe(
      "Gönderilen ana tutar, sayı olarak (örn. 1650.50). İşlem ücreti, bakiye, " +
        "limit gibi diğer tutarları ALMA. Okunamıyorsa null.",
    ),
  para_birimi: z.string().nullable().describe("TRY, USD, EUR gibi. Bilinmiyorsa null."),
  tarih: z
    .string()
    .nullable()
    .describe("İşlem tarihi, YYYY-MM-DD biçiminde. Yoksa null."),
  alici_iban: z
    .string()
    .nullable()
    .describe("Paranın gittiği IBAN, boşluksuz. Yoksa null."),
  alici_ad: z.string().nullable().describe("Alıcı/lehtar adı. Yoksa null."),
  gonderen_ad: z.string().nullable().describe("Gönderen kişinin adı. Yoksa null."),
  banka: z.string().nullable().describe("Dekontu düzenleyen banka. Yoksa null."),
  aciklama: z
    .string()
    .describe(
      "okunabilir=false ise nedenini tek cümleyle Türkçe yaz. " +
        "okunabilir=true ise kısa bir özet yaz.",
    ),
});

export type DekontOkuma = z.infer<typeof DekontSemasi>;

const SISTEM_TALIMATI = `Sen bir banka dekontu okuyucususun. Sana verilen görsel veya PDF, Türkiye'deki bir bankadan alınmış para transferi (havale/EFT/FAST) dekontu ya da mobil bankacılık ekran görüntüsü olabilir.

Kurallar:
- Sadece dosyada AÇIKÇA gördüğün bilgiyi yaz. Tahmin etme, uydurma.
- Bir alanı okuyamıyorsan null yaz; yaklaşık değer verme.
- "tutar" alanına gönderilen ana tutarı yaz. Dekontta işlem ücreti, masraf,
  kalan bakiye, hesap limiti gibi başka tutarlar da varsa onları ALMA.
- Türk sayı biçimini doğru çevir: "1.650,50" -> 1650.50 ("." binlik, "," ondalık).
- Dosya bir dekont değilse (rastgele fotoğraf, ekran görüntüsü, boş sayfa) ya da
  tutar okunamıyorsa okunabilir=false yap ve nedenini aciklama alanına yaz.
- Dekont olduğu hâlde yalnızca bazı alanlar okunamıyorsa okunabilir=true kalsın;
  yalnız okunamayan alanları null yap.`;

const GORSEL_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export type DesteklenenMime = (typeof GORSEL_MIME)[number] | "application/pdf";

export function mimeDesteklenirMi(mime: string): mime is DesteklenenMime {
  return mime === "application/pdf" || (GORSEL_MIME as readonly string[]).includes(mime);
}

/**
 * Dekonttan tutar ve diğer alanları çıkarır.
 *
 * output_config.format sayesinde yanıtın şekli API tarafından garanti edilir —
 * elle JSON ayrıştırmaya ve "model yanlış biçim döndürdü" hatalarına gerek yok.
 * effort "low": dekont okuma derin akıl yürütme istemeyen bir çıkarım işi.
 */
export async function dekontOku(
  dosya: Buffer,
  mime: DesteklenenMime,
): Promise<DekontOkuma> {
  const client = new Anthropic();
  const veri = dosya.toString("base64");

  const icerik: Anthropic.ContentBlockParam[] =
    mime === "application/pdf"
      ? [{ type: "document", source: { type: "base64", media_type: mime, data: veri } }]
      : [{ type: "image", source: { type: "base64", media_type: mime, data: veri } }];

  icerik.push({
    type: "text",
    text: "Bu dekonttaki bilgileri çıkar.",
  });

  const yanit = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 2000,
    system: SISTEM_TALIMATI,
    output_config: {
      effort: "low",
      format: zodOutputFormat(DekontSemasi),
    },
    messages: [{ role: "user", content: icerik }],
  });

  if (yanit.stop_reason === "refusal") {
    throw new Error("Dosya güvenlik nedeniyle işlenemedi.");
  }

  if (!yanit.parsed_output) {
    throw new Error("Dekont okunamadı: model beklenen biçimde yanıt vermedi.");
  }

  return yanit.parsed_output;
}
