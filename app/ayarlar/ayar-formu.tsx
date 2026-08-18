"use client";

import { useActionState, useRef, useState } from "react";
import GonderButonu from "@/components/gonder-butonu";
import type { Settings } from "@/lib/types.ts";
import { ayarlariKaydet, type ActionSonuc } from "./actions";

const BOS: ActionSonuc = {};
const girdi =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900";

type YerTutucu = { anahtar: string; aciklama: string };

export default function AyarFormu({
  ayarlar,
  yerTutucular,
}: {
  ayarlar: Settings;
  yerTutucular: YerTutucu[];
}) {
  const [durum, action] = useActionState(ayarlariKaydet, BOS);
  const sablonRef = useRef<HTMLTextAreaElement>(null);
  const [sablon, setSablon] = useState(ayarlar.mesaj_sablonu);

  /** Yer tutucuyu imlecin bulunduğu yere ekler. */
  function yerTutucuEkle(anahtar: string) {
    const alan = sablonRef.current;
    if (!alan) return;

    const bas = alan.selectionStart ?? sablon.length;
    const son = alan.selectionEnd ?? sablon.length;
    const yeni = sablon.slice(0, bas) + anahtar + sablon.slice(son);

    setSablon(yeni);
    requestAnimationFrame(() => {
      alan.focus();
      alan.setSelectionRange(bas + anahtar.length, bas + anahtar.length);
    });
  }

  return (
    <form action={action} className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium">Ödeme bilgileri</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">IBAN</span>
            <input
              name="iban"
              defaultValue={ayarlar.iban}
              placeholder="TR00 0000 0000 0000 0000 0000 00"
              className={girdi + " font-mono"}
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium">Hesap sahibi</span>
            <input
              name="hesap_sahibi"
              defaultValue={ayarlar.hesap_sahibi}
              placeholder="Ad Soyad"
              className={girdi}
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block font-medium">Varsayılan son ödeme günü</span>
            <input
              type="number"
              name="varsayilan_son_odeme_gunu"
              min={1}
              max={28}
              defaultValue={ayarlar.varsayilan_son_odeme_gunu}
              className={girdi}
            />
            <span className="mt-1 block text-xs text-slate-500">
              Yeni fatura açarken ayın bu günü önerilir. Her faturada ayrıca
              değiştirebilirsiniz.
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 font-medium">WhatsApp mesaj şablonu</h2>
        <p className="mb-3 text-sm text-slate-500">
          Süslü parantezli alanlar gönderim sırasında otomatik doldurulur.
          Eklemek için imleci istediğiniz yere koyup aşağıdaki düğmelere basın.
        </p>

        <textarea
          ref={sablonRef}
          name="mesaj_sablonu"
          value={sablon}
          onChange={(e) => setSablon(e.target.value)}
          rows={14}
          className={girdi + " font-mono text-xs leading-relaxed"}
        />

        <div className="mt-3 flex flex-wrap gap-1.5">
          {yerTutucular.map((y) => (
            <button
              key={y.anahtar}
              type="button"
              title={y.aciklama}
              onClick={() => yerTutucuEkle(y.anahtar)}
              className="rounded-lg border border-slate-300 px-2 py-1 font-mono text-xs text-slate-600 hover:bg-slate-50"
            >
              {y.anahtar}
            </button>
          ))}
        </div>

        {!sablon.includes("{dekont_linki}") && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Şablonda <code className="font-mono">{"{dekont_linki}"}</code> yok.
            Bu olmadan kiracı dekontunu yükleyemez.
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <GonderButonu>Ayarları kaydet</GonderButonu>
        {durum.hata && <span className="text-sm text-red-700">{durum.hata}</span>}
        {durum.basari && (
          <span className="text-sm text-emerald-700">{durum.basari}</span>
        )}
      </div>
    </form>
  );
}
