"use client";

import { useActionState, useState } from "react";
import GonderButonu from "@/components/gonder-butonu";
import { para, sonOdemeTarihi, tarihTR } from "@/lib/format";
import type { InvoiceDurum } from "@/lib/types";
import {
  eldeOdendiIsaretle,
  faturaKaydet,
  gonderildiIsaretle,
  odemeyiGeriAl,
  type ActionSonuc,
} from "./actions";

const BOS: ActionSonuc = {};
const girdi =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900";

/** Sık kullanılan kalem adları — tek tıkla eklenir. */
const HAZIR_KALEMLER = ["Su", "Elektrik", "Doğalgaz", "Aidat"];

type Kalem = { baslik: string; tutar: string };

type FaturaOzeti = {
  id: string;
  durum: InvoiceDurum;
  toplam: number;
  son_odeme_tarihi: string;
  gonderildi_at: string | null;
  incelendi_at: string | null;
  public_token: string;
  items: { baslik: string; tutar: number }[];
};

export default function FaturaPaneli({
  unitId,
  donem,
  fatura,
  varsayilanVade,
  oncekiKalemler,
  mesaj,
  waLink,
  telefon,
  wahaAktif,
  dekontAdresi,
}: {
  unitId: string;
  donem: string;
  fatura: FaturaOzeti | null;
  varsayilanVade: number;
  oncekiKalemler: { baslik: string; tutar: number }[] | null;
  mesaj: string | null;
  waLink: string | null;
  telefon: string | null;
  wahaAktif: boolean;
  dekontAdresi: string | null;
}) {
  const [kaydetDurum, kaydetAction] = useActionState(faturaKaydet, BOS);

  const [kalemler, setKalemler] = useState<Kalem[]>(() =>
    fatura && fatura.items.length > 0
      ? fatura.items.map((k) => ({
          baslik: k.baslik,
          tutar: k.tutar.toFixed(2).replace(".", ","),
        }))
      : [{ baslik: "", tutar: "" }],
  );

  const toplam = kalemler.reduce((t, k) => {
    const n = Number(k.tutar.replace(/\./g, "").replace(",", "."));
    return t + (Number.isFinite(n) ? n : 0);
  }, 0);

  function kalemDegistir(i: number, alan: keyof Kalem, deger: string) {
    setKalemler((eski) =>
      eski.map((k, idx) => (idx === i ? { ...k, [alan]: deger } : k)),
    );
  }

  function kalemEkle(baslik = "") {
    setKalemler((eski) => [...eski, { baslik, tutar: "" }]);
  }

  function kalemSil(i: number) {
    setKalemler((eski) =>
      eski.length === 1 ? [{ baslik: "", tutar: "" }] : eski.filter((_, idx) => idx !== i),
    );
  }

  const kalemlerBos = kalemler.every((k) => !k.baslik.trim() && !k.tutar.trim());

  function gecenAyiKopyala() {
    if (!oncekiKalemler || oncekiKalemler.length === 0) return;
    setKalemler(
      oncekiKalemler.map((k) => ({
        baslik: k.baslik,
        tutar: k.tutar.toFixed(2).replace(".", ","),
      })),
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-3 font-medium">Fatura kalemleri</h2>

        <form action={kaydetAction} className="space-y-4 p-4">
          <input type="hidden" name="unit_id" value={unitId} />
          <input type="hidden" name="donem" value={donem} />

          <div className="space-y-2">
            {kalemler.map((kalem, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  name="baslik"
                  value={kalem.baslik}
                  onChange={(e) => kalemDegistir(i, "baslik", e.target.value)}
                  placeholder="Kalem adı (Su, Elektrik…)"
                  className={girdi + " flex-1"}
                />
                <input
                  name="tutar"
                  value={kalem.tutar}
                  onChange={(e) => kalemDegistir(i, "tutar", e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  className={girdi + " w-32 text-right"}
                />
                <button
                  type="button"
                  onClick={() => kalemSil(i)}
                  aria-label="Kalemi sil"
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700 sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => kalemEkle()}
              className="rounded-lg border border-slate-300 px-3 py-2.5 sm:py-1.5 hover:bg-slate-50"
            >
              + Kalem ekle
            </button>
            {kalemlerBos && oncekiKalemler && oncekiKalemler.length > 0 && (
              <button
                type="button"
                onClick={gecenAyiKopyala}
                className="rounded-lg border border-dashed border-slate-300 px-3 py-2.5 sm:py-1.5 text-slate-600 hover:bg-slate-50"
              >
                ↺ Geçen ayki kalemleri kopyala
              </button>
            )}
            {HAZIR_KALEMLER.filter(
              (h) => !kalemler.some((k) => k.baslik.toLowerCase() === h.toLowerCase()),
            ).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => kalemEkle(h)}
                className="rounded-lg border border-dashed border-slate-300 px-3 py-2.5 sm:py-1.5 text-slate-500 hover:bg-slate-50"
              >
                + {h}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-4">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Son ödeme tarihi</span>
              <input
                type="date"
                name="son_odeme_tarihi"
                defaultValue={
                  fatura?.son_odeme_tarihi ?? sonOdemeTarihi(donem, varsayilanVade)
                }
                className={girdi}
              />
            </label>

            <div className="text-right">
              <p className="text-xs text-slate-500">Toplam</p>
              <p className="text-2xl font-semibold">{para(toplam)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <GonderButonu>{fatura ? "Faturayı güncelle" : "Faturayı kaydet"}</GonderButonu>
            {kaydetDurum.hata && (
              <span className="text-sm text-red-700">{kaydetDurum.hata}</span>
            )}
            {kaydetDurum.basari && (
              <span className="text-sm text-emerald-700">{kaydetDurum.basari}</span>
            )}
          </div>
        </form>
      </section>

      {fatura && mesaj && (
        <GonderimPaneli
          unitId={unitId}
          fatura={fatura}
          mesaj={mesaj}
          waLink={waLink}
          telefon={telefon}
          wahaAktif={wahaAktif}
          dekontAdresi={dekontAdresi}
        />
      )}
    </div>
  );
}

function GonderimPaneli({
  unitId,
  fatura,
  mesaj,
  waLink,
  telefon,
  wahaAktif,
  dekontAdresi,
}: {
  unitId: string;
  fatura: FaturaOzeti;
  mesaj: string;
  waLink: string | null;
  telefon: string | null;
  wahaAktif: boolean;
  dekontAdresi: string | null;
}) {
  const [, gonderildiAction] = useActionState(gonderildiIsaretle, BOS);
  const [odendiDurum, odendiAction] = useActionState(eldeOdendiIsaretle, BOS);
  const [geriAlDurum, geriAlAction] = useActionState(odemeyiGeriAl, BOS);
  const [kopyalandi, setKopyalandi] = useState<"mesaj" | "link" | null>(null);
  const [onizleme, setOnizleme] = useState(false);

  async function kopyala(metin: string, hangi: "mesaj" | "link") {
    try {
      await navigator.clipboard.writeText(metin);
      setKopyalandi(hangi);
      setTimeout(() => setKopyalandi(null), 2000);
    } catch {
      setKopyalandi(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <h2 className="border-b border-slate-100 px-4 py-3 font-medium">Kiracıya gönder</h2>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {waLink ? (
            // WAHA kapalıyken: aynı tıklamada hem WhatsApp açılır hem fatura
            // "gönderildi" olur. WAHA açıkken: mesaj sunucudan otomatik gider,
            // hiçbir sekme açılmaz.
            <form action={gonderildiAction}>
              <input type="hidden" name="fatura_id" value={fatura.id} />
              <input type="hidden" name="unit_id" value={unitId} />
              <input type="hidden" name="telefon" value={telefon ?? ""} />
              <input type="hidden" name="mesaj" value={mesaj} />
              <button
                type="submit"
                onClick={() => {
                  if (!wahaAktif) window.open(waLink, "_blank", "noopener");
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                {wahaAktif ? "WhatsApp'tan gönder" : "WhatsApp'ta gönder"}
              </button>
            </form>
          ) : (
            <span className="text-sm text-slate-500">
              Telefon numarası yok — mesajı kopyalayıp elle gönderin.
            </span>
          )}

          <button
            onClick={() => kopyala(mesaj, "mesaj")}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            {kopyalandi === "mesaj" ? "Kopyalandı ✓" : "Mesajı kopyala"}
          </button>

          {dekontAdresi && (
            <button
              onClick={() => kopyala(dekontAdresi, "link")}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              {kopyalandi === "link" ? "Kopyalandı ✓" : "Dekont linkini kopyala"}
            </button>
          )}

          <button
            onClick={() => setOnizleme((o) => !o)}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
          >
            {onizleme ? "Önizlemeyi gizle" : "Mesajı önizle"}
          </button>
        </div>

        {onizleme && (
          <pre className="max-h-80 overflow-auto rounded-lg bg-slate-50 p-4 text-sm whitespace-pre-wrap">
            {mesaj}
          </pre>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-sm text-slate-500">
          {fatura.gonderildi_at ? (
            <span>
              Gönderildi: {new Date(fatura.gonderildi_at).toLocaleString("tr-TR")}
            </span>
          ) : (
            <span>Henüz gönderilmedi.</span>
          )}
          <span>Son ödeme: {tarihTR(fatura.son_odeme_tarihi)}</span>

          <div className="ml-auto flex items-center gap-2">
            {fatura.durum === "odendi" ? (
              <form action={geriAlAction}>
                <input type="hidden" name="fatura_id" value={fatura.id} />
                <input type="hidden" name="unit_id" value={unitId} />
                <button
                  type="submit"
                  className="rounded-lg px-3 py-2.5 sm:py-1.5 hover:bg-slate-100 hover:text-slate-900"
                >
                  Ödemeyi geri al
                </button>
              </form>
            ) : (
              <form action={odendiAction}>
                <input type="hidden" name="fatura_id" value={fatura.id} />
                <input type="hidden" name="unit_id" value={unitId} />
                <button
                  type="submit"
                  title="Nakit ödeme veya okunamayan dekont gibi durumlar için"
                  className="rounded-lg px-3 py-2.5 sm:py-1.5 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  Elle ödendi işaretle
                </button>
              </form>
            )}
          </div>
        </div>

        {(odendiDurum.hata || geriAlDurum.hata) && (
          <p className="text-sm text-red-700">{odendiDurum.hata ?? geriAlDurum.hata}</p>
        )}
      </div>
    </section>
  );
}
