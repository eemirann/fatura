"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { para, tarihTR } from "@/lib/format";
import type { ReceiptEslesme, ReceiptKaynak } from "@/lib/types";
import { incelendiIsaretle, type ActionSonuc } from "./actions";

const BOS: ActionSonuc = {};

export type DekontGorunum = {
  id: string;
  kaynak: ReceiptKaynak;
  eslesme: ReceiptEslesme;
  okunan_tutar: number | null;
  okunan_tarih: string | null;
  okunan_iban: string | null;
  okunan_gonderen: string | null;
  okunan_banka: string | null;
  aciklama: string | null;
  dosya_adi: string | null;
  mime: string;
  created_at: string;
  url: string | null;
};

const KAYNAK_ETIKET: Record<ReceiptKaynak, string> = {
  kiraci_link: "kiracı yükledi",
  panel: "panelden yüklendi",
  api: "otomatik (n8n)",
};

const ESLESME_STIL: Record<ReceiptEslesme, { etiket: string; sinif: string }> = {
  matched: {
    etiket: "Tutar eşleşti",
    sinif: "border-emerald-300 bg-emerald-50 text-emerald-800",
  },
  mismatch: {
    etiket: "Tutar uyuşmadı",
    sinif: "border-orange-300 bg-orange-50 text-orange-800",
  },
  unreadable: {
    etiket: "Okunamadı",
    sinif: "border-slate-300 bg-slate-50 text-slate-700",
  },
};

export default function DekontListesi({
  unitId,
  faturaId,
  beklenenTutar,
  dekontlar,
}: {
  unitId: string;
  faturaId: string;
  beklenenTutar: number;
  dekontlar: DekontGorunum[];
}) {
  const [incelendiDurum, incelendiAction] = useActionState(incelendiIsaretle, BOS);

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="font-medium">
          Dekontlar
          {dekontlar.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-500">
              {dekontlar.length} adet
            </span>
          )}
        </h2>

        {dekontlar.length > 0 && (
          <form action={incelendiAction}>
            <input type="hidden" name="fatura_id" value={faturaId} />
            <input type="hidden" name="unit_id" value={unitId} />
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              İnceledim, rozeti kaldır
            </button>
          </form>
        )}
      </div>

      {incelendiDurum.hata && (
        <p className="border-b border-slate-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {incelendiDurum.hata}
        </p>
      )}

      {dekontlar.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">
          Henüz dekont yok. Kiracı mesajdaki linkten yükleyebilir; elinizdeki bir
          dosyayı aşağıdan siz de yükleyebilirsiniz.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {dekontlar.map((d) => (
            <DekontSatiri key={d.id} dekont={d} beklenenTutar={beklenenTutar} />
          ))}
        </ul>
      )}

      <YuklemeFormu faturaId={faturaId} />
    </section>
  );
}

function DekontSatiri({
  dekont,
  beklenenTutar,
}: {
  dekont: DekontGorunum;
  beklenenTutar: number;
}) {
  const stil = ESLESME_STIL[dekont.eslesme];
  const fark =
    dekont.okunan_tutar === null ? null : dekont.okunan_tutar - beklenenTutar;

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs ${stil.sinif}`}>
          {stil.etiket}
        </span>
        <span className="text-xs text-slate-500">{KAYNAK_ETIKET[dekont.kaynak]}</span>
        <span className="text-xs text-slate-400">
          {new Date(dekont.created_at).toLocaleString("tr-TR")}
        </span>

        {dekont.url && (
          <a
            href={dekont.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
          >
            Dekontu aç
          </a>
        )}
      </div>

      {dekont.eslesme === "unreadable" ? (
        <p className="mt-2 text-sm text-slate-600">
          {dekont.aciklama ?? "Dosyadan tutar okunamadı. Dekontu açıp elle kontrol edin."}
        </p>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <Alan etiket="Dekonttaki tutar" deger={para(dekont.okunan_tutar)} vurgu />
          <Alan etiket="Beklenen" deger={para(beklenenTutar)} />
          <Alan etiket="Tarih" deger={tarihTR(dekont.okunan_tarih)} />
          <Alan etiket="Gönderen" deger={dekont.okunan_gonderen ?? "—"} />
          {dekont.okunan_banka && <Alan etiket="Banka" deger={dekont.okunan_banka} />}
          {dekont.okunan_iban && <Alan etiket="Alıcı IBAN" deger={dekont.okunan_iban} />}
        </dl>
      )}

      {fark !== null && Math.abs(fark) > 0.01 && (
        <p className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900">
          Aradaki fark: <strong>{para(Math.abs(fark))}</strong>{" "}
          {fark > 0 ? "fazla ödenmiş" : "eksik ödenmiş"} görünüyor.
        </p>
      )}
    </li>
  );
}

function Alan({
  etiket,
  deger,
  vurgu,
}: {
  etiket: string;
  deger: string;
  vurgu?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{etiket}</dt>
      <dd className={vurgu ? "font-semibold" : ""}>{deger}</dd>
    </div>
  );
}

function YuklemeFormu({ faturaId }: { faturaId: string }) {
  const router = useRouter();
  const dosyaRef = useRef<HTMLInputElement>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function yukle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dosya = dosyaRef.current?.files?.[0];
    if (!dosya) return;

    setYukleniyor(true);
    setHata(null);

    const gövde = new FormData();
    gövde.set("invoice_id", faturaId);
    gövde.set("file", dosya);

    try {
      const cevap = await fetch("/api/ingest", { method: "POST", body: gövde });
      const sonuc = await cevap.json().catch(() => ({}));

      if (!cevap.ok) {
        setHata(sonuc.hata ?? "Dekont yüklenemedi.");
        return;
      }

      if (dosyaRef.current) dosyaRef.current.value = "";
      router.refresh();
    } catch {
      setHata("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <form
      onSubmit={yukle}
      className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50 p-4"
    >
      <input
        ref={dosyaRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        required
        className="max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:text-white"
      />
      <button
        type="submit"
        disabled={yukleniyor}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {yukleniyor ? "Okunuyor…" : "Dekont yükle"}
      </button>
      {hata && <span className="text-sm text-red-700">{hata}</span>}
    </form>
  );
}
