import { notFound } from "next/navigation";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { donemEtiketi, isoGun, para, tarihTR } from "@/lib/format";
import { borcOzeti, type BorcFaturasi } from "@/lib/borc";
import type { Invoice, InvoiceItem, Receipt } from "@/lib/types";
import KiraciYukleme from "./kiraci-yukleme";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Kiracının dekont yükleme sayfası — oturum yok, yetki token'ın kendisidir.
 * Bu yüzden yalnızca kiracının zaten bildiği bilgiler gösterilir; başka
 * dairelere veya panele dair hiçbir veri sızmaz.
 */
export default async function KiraciSayfasi({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!UUID.test(token)) notFound();

  const admin = getAdminSupabase();

  const { data: fatura } = await admin
    .from("invoices")
    .select(
      "id, unit_id, donem, son_odeme_tarihi, toplam, durum, invoice_items(baslik, tutar, sira), units(kapi_no, kiraci_adi, blocks(ad))",
    )
    .eq("public_token", token)
    .maybeSingle();

  if (!fatura) notFound();

  const { data: ayarlar } = await admin
    .from("settings")
    .select("iban, hesap_sahibi")
    .single();

  // Bu dairenin kapanmamış TÜM dönemleri. Kiracı bugüne kadar yalnızca
  // kendisine link gönderilen tek ayı görebiliyordu; üç ay biriken borçta
  // hiçbir yerde toplam yazmıyordu. Kapsam daire ile sınırlı — kiracı zaten
  // kendi dairesinin borcunu görüyor, başka daireye erişim yok.
  const { data: acikFaturalar } = await admin
    .from("invoices")
    .select("donem, toplam, durum, son_odeme_tarihi, receipts(eslesme, okunan_tutar)")
    .eq("unit_id", fatura.unit_id)
    .in("durum", ["gonderildi", "uyusmadi"]);

  const borc = borcOzeti(
    ((acikFaturalar ?? []) as unknown as {
      donem: string;
      toplam: number | string;
      durum: Invoice["durum"];
      son_odeme_tarihi: string;
      receipts: Pick<Receipt, "eslesme" | "okunan_tutar">[] | null;
    }[]).map<BorcFaturasi>((f) => ({
      donem: f.donem,
      toplam: Number(f.toplam ?? 0),
      durum: f.durum,
      son_odeme_tarihi: f.son_odeme_tarihi,
      dekontlar: (f.receipts ?? []).map((r) => ({
        eslesme: r.eslesme,
        okunan_tutar: r.okunan_tutar === null ? null : Number(r.okunan_tutar),
      })),
    })),
    isoGun(),
  );

  // Yalnızca gösterilen aydan fazlası varsa anlamlı: tek dönem borçluysa
  // zaten aşağıdaki fatura dökümü aynı bilgiyi veriyor.
  const birdenFazlaDonem = borc.kalemler.length > 1;

  const daire = fatura.units as unknown as {
    kapi_no: string;
    kiraci_adi: string | null;
    blocks: { ad: string };
  };

  const kalemler = ((fatura.invoice_items ?? []) as InvoiceItem[]).sort(
    (a, b) => a.sira - b.sira,
  );

  const odendi = fatura.durum === "odendi";
  const gecikti = !odendi && fatura.son_odeme_tarihi < new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto min-h-screen max-w-lg p-4 sm:py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm text-slate-500">
          {daire.blocks.ad} — Daire {daire.kapi_no}
        </p>
        <h1 className="mt-0.5 text-xl font-semibold">
          {donemEtiketi(fatura.donem)} fatura bilgileri
        </h1>
        {daire.kiraci_adi && (
          <p className="mt-1 text-sm text-slate-500">Sayın {daire.kiraci_adi}</p>
        )}

        {odendi && (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Ödemeniz alınmıştır. Teşekkür ederiz.
          </p>
        )}

        {gecikti && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Son ödeme tarihi geçmiş görünüyor.
          </p>
        )}

        <dl className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
          {kalemler.map((k) => (
            <div key={k.baslik} className="flex justify-between py-2.5 text-sm">
              <dt className="text-slate-600">{k.baslik}</dt>
              <dd>{para(Number(k.tutar))}</dd>
            </div>
          ))}
          <div className="flex justify-between py-3">
            <dt className="font-medium">Toplam</dt>
            <dd className="text-lg font-semibold">{para(Number(fatura.toplam))}</dd>
          </div>
        </dl>

        {birdenFazlaDonem && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-red-900">Toplam ödenmemiş borcunuz</p>
              <p className="text-xl font-semibold text-red-900">{para(borc.toplam)}</p>
            </div>

            <ul className="mt-3 divide-y divide-red-100 border-t border-red-100">
              {borc.kalemler.map((k) => (
                <li
                  key={k.donem}
                  className="flex justify-between gap-4 py-2 text-sm text-red-900"
                >
                  <span>
                    {donemEtiketi(k.donem)}
                    {k.odenen > 0 && (
                      <span className="text-red-700">
                        {" "}
                        · {para(k.odenen)} ödendi
                      </span>
                    )}
                  </span>
                  <span className="font-medium">{para(k.kalan)}</span>
                </li>
              ))}
            </ul>

            <p className="mt-3 text-xs text-red-800">
              Aşağıdaki hesaba toplam tutarı tek seferde ödeyebilir ya da ay ay
              ödeyip her biri için dekont gönderebilirsiniz.
            </p>
          </div>
        )}

        <div className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
          <Satir etiket="Son ödeme tarihi" deger={tarihTR(fatura.son_odeme_tarihi)} />
          <Satir etiket="Ad Soyad" deger={ayarlar?.hesap_sahibi || "—"} />
          <KopyalanabilirIban iban={ayarlar?.iban || ""} />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-medium">Dekont yükleyin</h2>
        <p className="mt-1 mb-4 text-sm text-slate-500">
          Ödemenizi yaptıktan sonra dekontun PDF&apos;ini veya ekran görüntüsünü
          buradan gönderin. Tutar doğrulanınca ödemeniz otomatik olarak işlenir.
        </p>
        <KiraciYukleme token={token} />
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Bu bağlantı yalnızca size özeldir, başkasıyla paylaşmayın.
      </p>
    </main>
  );
}

function Satir({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{etiket}</span>
      <span className="text-right font-medium">{deger}</span>
    </div>
  );
}

function KopyalanabilirIban({ iban }: { iban: string }) {
  if (!iban) return <Satir etiket="IBAN" deger="—" />;

  return (
    <div>
      <span className="text-slate-500">IBAN</span>
      <p className="mt-1 font-mono text-sm break-all select-all">{iban}</p>
    </div>
  );
}
