"use client";

import { useActionState, useState } from "react";
import GonderButonu from "@/components/gonder-butonu";
import type { Block, Unit } from "@/lib/types";
import { topluKalemUygula, type ActionSonuc } from "./actions";

const BOS: ActionSonuc = {};
const girdi =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900";

type BlokDaireler = Block & { units: Unit[] };

export default function TopluGirisFormu({
  bloklar,
  donemVarsayilan,
}: {
  bloklar: BlokDaireler[];
  donemVarsayilan: string;
}) {
  const [durum, action] = useActionState(topluKalemUygula, BOS);
  const tumDaireIdleri = bloklar.flatMap((b) => b.units.map((u) => u.id));
  const [secililer, setSecililer] = useState<Set<string>>(() => new Set(tumDaireIdleri));

  function tekBirDaire(id: string) {
    setSecililer((eski) => {
      const yeni = new Set(eski);
      if (yeni.has(id)) yeni.delete(id);
      else yeni.add(id);
      return yeni;
    });
  }

  function tumunuSecToggle() {
    setSecililer((eski) =>
      eski.size === tumDaireIdleri.length ? new Set() : new Set(tumDaireIdleri),
    );
  }

  return (
    <form action={action} className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Dönem</span>
            <input
              type="month"
              name="donem"
              defaultValue={donemVarsayilan.slice(0, 7)}
              className={girdi}
              required
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Kalem adı</span>
            <input name="baslik" placeholder="Aidat" className={girdi} required />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Tutar</span>
            <input
              name="tutar"
              inputMode="decimal"
              placeholder="750,00"
              className={girdi}
              required
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-medium">
            Daireler{" "}
            <span className="font-normal text-slate-500">
              ({secililer.size}/{tumDaireIdleri.length} seçili)
            </span>
          </h2>
          <button
            type="button"
            onClick={tumunuSecToggle}
            className="text-sm text-slate-600 underline hover:text-slate-900"
          >
            {secililer.size === tumDaireIdleri.length ? "Hiçbirini seçme" : "Tümünü seç"}
          </button>
        </div>

        <div className="max-h-96 space-y-4 overflow-y-auto p-4">
          {bloklar.map((blok) =>
            blok.units.length === 0 ? null : (
              <div key={blok.id}>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  {blok.ad}
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {blok.units.map((u) => (
                    <label
                      key={u.id}
                      className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2.5 text-sm sm:min-h-0 sm:py-2 ${
                        secililer.has(u.id)
                          ? "border-slate-900 bg-slate-50"
                          : "border-slate-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="unit_id"
                        value={u.id}
                        checked={secililer.has(u.id)}
                        onChange={() => tekBirDaire(u.id)}
                      />
                      <span className="truncate">
                        {u.kapi_no}
                        {u.kiraci_adi && (
                          <span className="text-slate-400"> · {u.kiraci_adi}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ),
          )}
          {tumDaireIdleri.length === 0 && (
            <p className="text-sm text-slate-500">Aktif daire yok.</p>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <GonderButonu>Uygula</GonderButonu>
        {durum.basari && <span className="text-sm text-emerald-700">{durum.basari}</span>}
        {durum.hata && <span className="text-sm text-red-700">{durum.hata}</span>}
      </div>
    </form>
  );
}
