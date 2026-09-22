import type { InvoiceDurum, ReceiptEslesme } from "./types.ts";
import { toplananTutar } from "./esles.ts";

/**
 * Apartman kasası: ne girdi, ne çıktı, elde ne kaldı.
 *
 * Kat Mülkiyeti Kanunu gereği yönetici kat maliklerine hesap vermek zorunda;
 * panel bugüne kadar yalnızca tahsilat tarafını bildiği için bu rapor
 * panelden çıkarılamıyordu.
 *
 * Bakiye SAKLANMIYOR, her seferinde faturalardan ve giderlerden türetiliyor —
 * saklanan bir bakiye elle düzeltmeler sonrasında gerçekle arasını açardı
 * (aynı gerekçe: lib/borc.ts).
 */

export type TahsilatFaturasi = {
  toplam: number;
  durum: InvoiceDurum;
  dekontlar: { eslesme: ReceiptEslesme; okunan_tutar: number | null }[];
};

export type KasaOzeti = {
  tahsilat: number;
  gider: number;
  bakiye: number;
};

/**
 * Bir faturadan fiilen tahsil edilmiş tutar.
 *
 * `lib/borc.ts`'teki `faturaKalani` ile simetriktir: açık bir faturada
 * tahsilat + kalan = toplam.
 *
 * `odendi` durumunda dekontlara bakılmaz, toplam alınır: nakit tahsilat
 * "elle ödendi" ile işaretlendiğinde ortada hiç dekont olmaz ve o para
 * kasaya girmemiş görünürdü.
 */
export function faturaTahsilati(f: TahsilatFaturasi): number {
  if (f.durum === "odendi") return Number(f.toplam);
  return toplananTutar(f.dekontlar);
}

export function toplamTahsilat(faturalar: TahsilatFaturasi[]): number {
  return faturalar.reduce((t, f) => t + faturaTahsilati(f), 0);
}

export function toplamGider(giderler: { tutar: number }[]): number {
  return giderler.reduce((t, g) => t + Number(g.tutar), 0);
}

export function kasaOzeti(
  faturalar: TahsilatFaturasi[],
  giderler: { tutar: number }[],
): KasaOzeti {
  const tahsilat = toplamTahsilat(faturalar);
  const gider = toplamGider(giderler);
  // Bakiye eksiye düşebilir ve düşmelidir: yönetici cebinden ödediğinde ya da
  // tahsilat gecikince kasa açık verir, bunu gizlemek işe yaramaz.
  return { tahsilat, gider, bakiye: tahsilat - gider };
}

/**
 * Bir gideri dairelere eşit böler.
 *
 * Kuruş artığı kaybolmasın diye son daireye ekleniyor: 100 TL'yi 3 daireye
 * bölünce 33,33 + 33,33 + 33,34 = 100,00 eder. Eşit bölüp yuvarlamak
 * toplamı 99,99'a düşürür ve kasa her paylaştırmada biraz daha kayardı.
 */
export function esitPaylastir(tutar: number, daireSayisi: number): number[] {
  if (daireSayisi <= 0) return [];

  const kurus = Math.round(Number(tutar) * 100);
  const payKurus = Math.floor(kurus / daireSayisi);
  const artik = kurus - payKurus * daireSayisi;

  const paylar = Array<number>(daireSayisi).fill(payKurus / 100);
  if (artik > 0) paylar[daireSayisi - 1] = (payKurus + artik) / 100;
  return paylar;
}
