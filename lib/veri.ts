import { getServerSupabase } from "./supabase/server.ts";
import { borcOzeti, type BorcFaturasi, type BorcOzeti } from "./borc.ts";
import { kasaOzeti, type KasaOzeti, type TahsilatFaturasi } from "./kasa.ts";
import type {
  Block,
  Expense,
  Invoice,
  InvoiceItem,
  Receipt,
  Settings,
  Unit,
} from "./types.ts";

export type DaireKarti = Unit & {
  invoice: (Invoice & { items: InvoiceItem[] }) | null;
};

export type BlokKarti = Block & { units: DaireKarti[] };

/** Ayarlar tek satır — yoksa (migration atlanmışsa) anlaşılır hata ver. */
export async function ayarlariGetir(): Promise<Settings> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.from("settings").select("*").single();
  if (error || !data) {
    throw new Error(
      "Ayarlar okunamadı. supabase/migrations/0001_init.sql çalıştırıldı mı? " +
        (error?.message ?? ""),
    );
  }
  return data as Settings;
}

/**
 * Panel gridi için tüm bloklar, daireleri ve o döneme ait faturaları.
 * İki sorgu atıp JS'te birleştirir — daire başına sorgu atmaktan çok daha ucuz.
 */
export async function panelVerisi(donem: string): Promise<BlokKarti[]> {
  const supabase = await getServerSupabase();

  const [bloklarSonuc, faturalarSonuc] = await Promise.all([
    supabase
      .from("blocks")
      .select("*, units(*)")
      .order("sira", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("donem", donem),
  ]);

  if (bloklarSonuc.error) throw new Error(bloklarSonuc.error.message);
  if (faturalarSonuc.error) throw new Error(faturalarSonuc.error.message);

  const faturaHaritasi = new Map<string, Invoice & { items: InvoiceItem[] }>();
  for (const f of faturalarSonuc.data ?? []) {
    const { invoice_items, ...invoice } = f as Invoice & {
      invoice_items: InvoiceItem[];
    };
    faturaHaritasi.set(invoice.unit_id, {
      ...invoice,
      items: (invoice_items ?? []).sort((a, b) => a.sira - b.sira),
    });
  }

  return ((bloklarSonuc.data ?? []) as (Block & { units: Unit[] })[]).map((blok) => ({
    ...blok,
    units: (blok.units ?? [])
      .sort((a, b) => a.sira - b.sira || a.kapi_no.localeCompare(b.kapi_no, "tr"))
      .map((u) => ({ ...u, invoice: faturaHaritasi.get(u.id) ?? null })),
  }));
}

/**
 * Dairelerin birikmiş borcu — daire id'sinden borç özetine harita.
 *
 * Tek sorgu: yalnızca kapanmamış faturalar (`gonderildi` / `uyusmadi`)
 * çekiliyor. `odendi` ve `taslak` zaten borç üretmediği için (bkz.
 * lib/borc.ts) veritabanından hiç getirilmiyorlar; tipik bir binada bu,
 * yüzlerce fatura yerine onlarcasını okumak demek.
 *
 * `unitId` verilirse yalnızca o daire için çalışır (daire detay sayfası).
 */
export async function borcVerisi(
  bugun: string,
  unitId?: string,
): Promise<Map<string, BorcOzeti>> {
  const supabase = await getServerSupabase();

  let sorgu = supabase
    .from("invoices")
    .select("unit_id, donem, toplam, durum, son_odeme_tarihi, receipts(eslesme, okunan_tutar)")
    .in("durum", ["gonderildi", "uyusmadi"]);

  if (unitId) sorgu = sorgu.eq("unit_id", unitId);

  const { data, error } = await sorgu;
  if (error) throw new Error(error.message);

  // Supabase numeric alanları çalışma zamanında string dönebiliyor; borç
  // aritmetiğine girmeden önce sayıya çeviriyoruz.
  const daireBasina = new Map<string, BorcFaturasi[]>();
  for (const f of data ?? []) {
    const satir = f as unknown as {
      unit_id: string;
      donem: string;
      toplam: number | string;
      durum: Invoice["durum"];
      son_odeme_tarihi: string;
      receipts: Pick<Receipt, "eslesme" | "okunan_tutar">[] | null;
    };

    const liste = daireBasina.get(satir.unit_id) ?? [];
    liste.push({
      donem: satir.donem,
      toplam: Number(satir.toplam ?? 0),
      durum: satir.durum,
      son_odeme_tarihi: satir.son_odeme_tarihi,
      dekontlar: (satir.receipts ?? []).map((r) => ({
        eslesme: r.eslesme,
        okunan_tutar: r.okunan_tutar === null ? null : Number(r.okunan_tutar),
      })),
    });
    daireBasina.set(satir.unit_id, liste);
  }

  const sonuc = new Map<string, BorcOzeti>();
  for (const [id, faturalar] of daireBasina) {
    const ozet = borcOzeti(faturalar, bugun);
    if (ozet.toplam > 0) sonuc.set(id, ozet);
  }
  return sonuc;
}

/**
 * Kasa sayfası: giderler + bakiyeyi çıkarmak için tahsilat verisi.
 *
 * Tahsilat, faturaların TÜM dönemleri üzerinden hesaplanıyor; kasa bir ayın
 * değil apartmanın toplam durumudur. Yalnızca hesaba giren alanlar
 * çekiliyor (toplam, durum ve dekont tutarları), fatura kalemleri değil.
 */
export async function kasaVerisi(): Promise<{
  ozet: KasaOzeti;
  giderler: Expense[];
}> {
  const supabase = await getServerSupabase();

  const [faturalarSonuc, giderlerSonuc] = await Promise.all([
    supabase.from("invoices").select("toplam, durum, receipts(eslesme, okunan_tutar)"),
    supabase.from("expenses").select("*").order("tarih", { ascending: false }),
  ]);

  if (faturalarSonuc.error) throw new Error(faturalarSonuc.error.message);
  if (giderlerSonuc.error) {
    throw new Error(
      "Giderler okunamadı. supabase/migrations/0007_giderler.sql çalıştırıldı mı? " +
        giderlerSonuc.error.message,
    );
  }

  // Supabase numeric alanları çalışma zamanında string dönebiliyor.
  const faturalar: TahsilatFaturasi[] = (
    (faturalarSonuc.data ?? []) as unknown as {
      toplam: number | string;
      durum: Invoice["durum"];
      receipts: Pick<Receipt, "eslesme" | "okunan_tutar">[] | null;
    }[]
  ).map((f) => ({
    toplam: Number(f.toplam ?? 0),
    durum: f.durum,
    dekontlar: (f.receipts ?? []).map((r) => ({
      eslesme: r.eslesme,
      okunan_tutar: r.okunan_tutar === null ? null : Number(r.okunan_tutar),
    })),
  }));

  const giderler = ((giderlerSonuc.data ?? []) as Expense[]).map((g) => ({
    ...g,
    tutar: Number(g.tutar),
  }));

  return { ozet: kasaOzeti(faturalar, giderler), giderler };
}

export type BildirimDaire = Unit & {
  block: Block;
  invoice:
    | (Invoice & {
        items: InvoiceItem[];
        receipts: Pick<Receipt, "eslesme" | "okunan_tutar">[];
      })
    | null;
};

/**
 * Bildirimler sayfası için: aktif daireler + seçili dönemin faturası +
 * kısmi ödeme tespiti için dekontların eşleşme/tutar bilgisi (dosya/tarih
 * gibi ayrıntılar gerekmiyor, sadece toplamayı hesaplayacak kadarı).
 */
export async function bildirimVerisi(donem: string): Promise<BildirimDaire[]> {
  const supabase = await getServerSupabase();

  const [unitsSonuc, faturalarSonuc] = await Promise.all([
    supabase.from("units").select("*, blocks(*)").eq("aktif", true),
    supabase
      .from("invoices")
      .select("*, invoice_items(*), receipts(eslesme, okunan_tutar)")
      .eq("donem", donem),
  ]);

  if (unitsSonuc.error) throw new Error(unitsSonuc.error.message);
  if (faturalarSonuc.error) throw new Error(faturalarSonuc.error.message);

  const faturaHaritasi = new Map<string, BildirimDaire["invoice"]>();
  for (const f of faturalarSonuc.data ?? []) {
    const { invoice_items, receipts, ...invoice } = f as Invoice & {
      invoice_items: InvoiceItem[];
      receipts: Pick<Receipt, "eslesme" | "okunan_tutar">[];
    };
    faturaHaritasi.set(invoice.unit_id, {
      ...invoice,
      items: (invoice_items ?? []).sort((a, b) => a.sira - b.sira),
      receipts: receipts ?? [],
    });
  }

  return ((unitsSonuc.data ?? []) as (Unit & { blocks: Block })[]).map((u) => {
    const { blocks, ...unit } = u;
    return { ...unit, block: blocks, invoice: faturaHaritasi.get(unit.id) ?? null };
  });
}

export type DaireDetay = Unit & {
  block: Block;
  invoice: (Invoice & { items: InvoiceItem[]; receipts: Receipt[] }) | null;
  gecmis: (Invoice & { items: InvoiceItem[] })[];
};

/** Daire detay sayfası: daire + seçili dönemin faturası + geçmiş dönemler. */
export async function daireDetayi(
  unitId: string,
  donem: string,
): Promise<DaireDetay | null> {
  const supabase = await getServerSupabase();

  const { data: unit, error } = await supabase
    .from("units")
    .select("*, blocks(*)")
    .eq("id", unitId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!unit) return null;

  const [faturaSonuc, gecmisSonuc] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, invoice_items(*), receipts(*)")
      .eq("unit_id", unitId)
      .eq("donem", donem)
      .maybeSingle(),
    supabase
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("unit_id", unitId)
      .neq("donem", donem)
      .order("donem", { ascending: false })
      .limit(12),
  ]);

  if (faturaSonuc.error) throw new Error(faturaSonuc.error.message);
  if (gecmisSonuc.error) throw new Error(gecmisSonuc.error.message);

  const { blocks, ...daire } = unit as Unit & { blocks: Block };

  let invoice: DaireDetay["invoice"] = null;
  if (faturaSonuc.data) {
    const { invoice_items, receipts, ...f } = faturaSonuc.data as Invoice & {
      invoice_items: InvoiceItem[];
      receipts: Receipt[];
    };
    invoice = {
      ...f,
      items: (invoice_items ?? []).sort((a, b) => a.sira - b.sira),
      receipts: (receipts ?? []).sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    };
  }

  const gecmis = ((gecmisSonuc.data ?? []) as (Invoice & { invoice_items: InvoiceItem[] })[]).map(
    ({ invoice_items, ...f }) => ({
      ...f,
      items: (invoice_items ?? []).sort((a, b) => a.sira - b.sira),
    }),
  );

  return {
    ...daire,
    block: blocks,
    invoice,
    gecmis,
  };
}
