"use client";

import { useActionState, useState } from "react";
import GonderButonu from "@/components/gonder-butonu";
import { para, tarihTR } from "@/lib/format";
import {
  GIDER_KATEGORILERI,
  GIDER_KATEGORI_ADI,
  type Expense,
} from "@/lib/types";
import { giderEkle, giderSil, type ActionSonuc } from "./actions";

const BOS: ActionSonuc = {};
const girdi =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-900";

export default function GiderYonetimi({
  giderler,
  bugun,
  saltOkunur = false,
}: {
  giderler: Expense[];
  /** Yeni gider formunun varsayılan tarihi — sunucudan geliyor ki
   *  istemcinin saat dilimi tarihi kaydırmasın. */
  bugun: string;
  saltOkunur?: boolean;
}) {
  const [ekleDurum, ekleAction] = useActionState(giderEkle, BOS);

  return (
    <>
      {!saltOkunur && (
        <section className="rounded-xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-100 px-4 py-3 font-medium">
            Yeni gider
          </h2>

          <form action={ekleAction} className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm lg:col-span-2">
                <span className="mb-1 block font-medium">Gider adı</span>
                <input
                  name="baslik"
                  required
                  placeholder="Kapıcı maaşı"
                  className={girdi}
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium">Tutar</span>
                <input
                  name="tutar"
                  required
                  inputMode="decimal"
                  placeholder="12.500,00"
                  className={girdi + " text-right"}
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium">Tarih</span>
                <input
                  type="date"
                  name="tarih"
                  required
                  defaultValue={bugun}
                  className={girdi}
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium">Kategori</span>
                <select name="kategori" defaultValue="diger" className={girdi}>
                  {GIDER_KATEGORILERI.map((k) => (
                    <option key={k} value={k}>
                      {GIDER_KATEGORI_ADI[k]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm lg:col-span-3">
                <span className="mb-1 block font-medium">
                  Açıklama <span className="font-normal text-slate-400">(isteğe bağlı)</span>
                </span>
                <input
                  name="aciklama"
                  placeholder="Eylül ayı, SGK dahil"
                  className={girdi}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <GonderButonu bekleyen="Ekleniyor…">Gideri kaydet</GonderButonu>
              {ekleDurum.hata && (
                <span className="text-sm text-red-700">{ekleDurum.hata}</span>
              )}
              {ekleDurum.basari && (
                <span className="text-sm text-emerald-700">{ekleDurum.basari}</span>
              )}
            </div>
          </form>
        </section>
      )}

      <section className="mt-4 rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-3 font-medium">
          Giderler
          {giderler.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-500">
              {giderler.length} kayıt
            </span>
          )}
        </h2>

        {giderler.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            Henüz gider girilmemiş. Kapıcı maaşı, asansör bakımı, yakıt gibi
            apartman harcamalarını buraya girdikçe kasa bakiyesi oluşur.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {giderler.map((g) => (
              <GiderSatiri key={g.id} gider={g} saltOkunur={saltOkunur} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function GiderSatiri({
  gider,
  saltOkunur,
}: {
  gider: Expense;
  saltOkunur: boolean;
}) {
  const [silDurum, silAction] = useActionState(giderSil, BOS);
  const [onay, setOnay] = useState(false);

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="w-24 shrink-0 text-slate-500">{tarihTR(gider.tarih)}</span>
        <span className="font-medium">{gider.baslik}</span>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {GIDER_KATEGORI_ADI[gider.kategori]}
        </span>
        {gider.aciklama && (
          <span className="text-slate-500">{gider.aciklama}</span>
        )}

        <span className="ml-auto flex items-center gap-3">
          <span className="font-semibold text-red-700">−{para(gider.tutar)}</span>

          {!saltOkunur &&
            (onay ? (
              <form action={silAction} className="flex items-center gap-2">
                <input type="hidden" name="id" value={gider.id} />
                <GonderButonu varyant="tehlike" bekleyen="Siliniyor…">
                  Evet, sil
                </GonderButonu>
                <button
                  type="button"
                  onClick={() => setOnay(false)}
                  className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                >
                  Vazgeç
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setOnay(true)}
                aria-label={`${gider.baslik} giderini sil`}
                className="rounded-lg px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-700"
              >
                ✕
              </button>
            ))}
        </span>
      </div>

      {silDurum.hata && (
        <p className="mt-2 text-sm text-red-700">{silDurum.hata}</p>
      )}
    </li>
  );
}
