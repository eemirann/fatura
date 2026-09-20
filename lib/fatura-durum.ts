import "server-only";
import type { getServerSupabase } from "./supabase/server.ts";
import { kalemDegisimindeDurum } from "./esles.ts";
import type { ReceiptEslesme } from "./types.ts";

type Supabase = Awaited<ReturnType<typeof getServerSupabase>>;

/**
 * Kalemleri değiştirilen bir faturanın durumunu dekontlarından yeniden belirler.
 *
 * Fatura upsert'i `durum` alanına dokunmaz (yalnızca verilen kolonlar
 * güncellenir). Bu yüzden ödenmiş bir dönemin faturası yeni bir tutarla
 * kaydedilince kalemler ve `toplam` değişiyor, ama durum `odendi` kalıyordu:
 * panelde yeşil görünen, karşılığı ödenmemiş bir fatura. Kimse fark etmiyor,
 * çünkü zaten ödenmiş görünüyor.
 *
 * Yeni toplam, `invoices.toplam` yerine kalemlerden toplanır: o alan trigger
 * ile güncelleniyor ve hemen ardından okumak yarışa açık olurdu.
 *
 * Hata varsa mesajı döner, yoksa null.
 */
export async function faturaDurumunuTazele(
  supabase: Supabase,
  faturaId: string,
  gonderildiAt: string | null,
): Promise<string | null> {
  const [{ data: kalemler, error: kalemHatasi }, { data: dekontlar, error: okumaHatasi }] =
    await Promise.all([
      supabase.from("invoice_items").select("tutar").eq("invoice_id", faturaId),
      supabase.from("receipts").select("eslesme, okunan_tutar").eq("invoice_id", faturaId),
    ]);

  if (kalemHatasi) return kalemHatasi.message;
  if (okumaHatasi) return okumaHatasi.message;

  const yeniToplam =
    Math.round(
      (kalemler ?? []).reduce((t: number, k: { tutar: number }) => t + Number(k.tutar), 0) * 100,
    ) / 100;

  const yeniDurum = kalemDegisimindeDurum(
    yeniToplam,
    (dekontlar ?? []).map((d: { eslesme: ReceiptEslesme; okunan_tutar: number | null }) => ({
      eslesme: d.eslesme,
      okunan_tutar: d.okunan_tutar === null ? null : Number(d.okunan_tutar),
    })),
    Boolean(gonderildiAt),
  );

  // incelendi_at da sıfırlanır: tutar değiştiyse ev sahibinin dekontlara
  // yeniden bakması gerekir, eski "inceledim" işareti artık geçerli değil.
  const { error: yazmaHatasi } = await supabase
    .from("invoices")
    .update({ durum: yeniDurum, incelendi_at: null })
    .eq("id", faturaId);

  return yazmaHatasi ? yazmaHatasi.message : null;
}
