import { getServerSupabase } from "./supabase/server.ts";
import type {
  Block,
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

export type DaireDetay = Unit & {
  block: Block;
  invoice: (Invoice & { items: InvoiceItem[]; receipts: Receipt[] }) | null;
  gecmis: Invoice[];
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
      .select("*")
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

  return {
    ...daire,
    block: blocks,
    invoice,
    gecmis: (gecmisSonuc.data ?? []) as Invoice[],
  };
}
