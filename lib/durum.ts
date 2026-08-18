import type { Invoice } from "./types";
import { isoGun } from "./format";

/**
 * Panelde bir dairenin görünen durumu.
 *
 * BURASI TEK KAYNAK — hem panel gridi hem daire detayı hem kiracı sayfası
 * rengi buradan alır. Renk kuralı değişecekse yalnızca bu dosya değişir.
 *
 * "gecikti" veritabanında saklanmaz; durum='gonderildi' ve son ödeme tarihi
 * geçmişse burada türetilir — böylece gece çalışacak bir cron'a gerek kalmaz.
 */
export type DurumKodu =
  | "yok"                  // fatura hiç açılmamış
  | "taslak"               // tutar girilmiş ama gönderilmemiş
  | "bekliyor"             // gönderildi, vadesi var
  | "gecikti"              // gönderildi, vadesi geçti
  | "uyusmadi"             // dekont geldi ama tutar tutmadı
  | "odendi_incelenmedi"   // otomatik eşleşti, sen henüz bakmadın
  | "odendi";              // eşleşti ve incelendi

export type DurumBilgisi = {
  kod: DurumKodu;
  etiket: string;
  /** Kart gövdesi için Tailwind sınıfları */
  kart: string;
  /** Küçük durum noktası için Tailwind sınıfları */
  nokta: string;
  /** Rozet gösterilsin mi (incelenmedi işareti) */
  rozet: boolean;
};

const TABLO: Record<DurumKodu, Omit<DurumBilgisi, "kod">> = {
  yok: {
    etiket: "Fatura girilmedi",
    kart: "bg-slate-50 border-slate-200 hover:border-slate-300",
    nokta: "bg-slate-300",
    rozet: false,
  },
  taslak: {
    etiket: "Taslak — gönderilmedi",
    kart: "bg-slate-50 border-slate-300 hover:border-slate-400",
    nokta: "bg-slate-400",
    rozet: false,
  },
  bekliyor: {
    etiket: "Ödeme bekleniyor",
    kart: "bg-amber-50 border-amber-300 hover:border-amber-400",
    nokta: "bg-amber-400",
    rozet: false,
  },
  gecikti: {
    etiket: "Vadesi geçti",
    kart: "bg-red-50 border-red-300 hover:border-red-400",
    nokta: "bg-red-500",
    rozet: false,
  },
  uyusmadi: {
    etiket: "Tutar uyuşmadı",
    kart: "bg-orange-50 border-orange-400 hover:border-orange-500",
    nokta: "bg-orange-500",
    rozet: true,
  },
  odendi_incelenmedi: {
    etiket: "Ödendi — incelenmedi",
    kart: "bg-emerald-50 border-emerald-300 hover:border-emerald-400",
    nokta: "bg-emerald-500",
    rozet: true,
  },
  odendi: {
    etiket: "Ödendi",
    kart: "bg-emerald-50 border-emerald-300 hover:border-emerald-400",
    nokta: "bg-emerald-500",
    rozet: false,
  },
};

export function durumHesapla(
  invoice: Pick<Invoice, "durum" | "son_odeme_tarihi" | "incelendi_at"> | null | undefined,
  bugun: string = isoGun(),
): DurumBilgisi {
  const kod = durumKodu(invoice, bugun);
  return { kod, ...TABLO[kod] };
}

function durumKodu(
  invoice: Pick<Invoice, "durum" | "son_odeme_tarihi" | "incelendi_at"> | null | undefined,
  bugun: string,
): DurumKodu {
  if (!invoice) return "yok";

  switch (invoice.durum) {
    case "taslak":
      return "taslak";
    case "uyusmadi":
      return "uyusmadi";
    case "odendi":
      return invoice.incelendi_at ? "odendi" : "odendi_incelenmedi";
    case "gonderildi":
      return invoice.son_odeme_tarihi < bugun ? "gecikti" : "bekliyor";
  }
}

/** Panel özetindeki sayaçlar için — hangi durumlar "dikkat gerektiriyor". */
export function ilgilenmeliMi(kod: DurumKodu): boolean {
  return kod === "gecikti" || kod === "uyusmadi" || kod === "odendi_incelenmedi";
}
