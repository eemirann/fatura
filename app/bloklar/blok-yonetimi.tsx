"use client";

import { useActionState, useState } from "react";
import GonderButonu from "@/components/gonder-butonu";
import type { Block, Unit } from "@/lib/types";
import {
  blokEkle,
  blokSil,
  daireEkle,
  daireGuncelle,
  daireSil,
  type ActionSonuc,
} from "./actions";

const BOS: ActionSonuc = {};
const girdi =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900";

export default function BlokYonetimi({
  bloklar,
}: {
  bloklar: (Block & { units: Unit[] })[];
}) {
  const [blokDurum, blokEkleAction] = useActionState(blokEkle, BOS);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium">Yeni blok</h2>
        <form action={blokEkleAction} className="flex flex-wrap items-start gap-2">
          <input
            name="ad"
            required
            placeholder="A Blok"
            className={girdi + " max-w-xs flex-1"}
          />
          <GonderButonu bekleyen="Ekleniyor…">Blok ekle</GonderButonu>
        </form>
        {blokDurum.hata && <p className="mt-2 text-sm text-red-700">{blokDurum.hata}</p>}
      </section>

      {bloklar.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Henüz blok yok. Yukarıdan ilk bloğu ekleyin.
        </p>
      )}

      {bloklar.map((blok) => (
        <BlokKarti key={blok.id} blok={blok} />
      ))}
    </div>
  );
}

function BlokKarti({ blok }: { blok: Block & { units: Unit[] } }) {
  const [silDurum, silAction] = useActionState(blokSil, BOS);
  const [ekleDurum, ekleAction] = useActionState(daireEkle, BOS);
  const [duzenlenen, setDuzenlenen] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="font-medium">
          {blok.ad}
          <span className="ml-2 text-sm font-normal text-slate-500">
            {blok.units.length} daire
          </span>
        </h2>
        <form action={silAction}>
          <input type="hidden" name="id" value={blok.id} />
          <button
            type="submit"
            className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-red-50 hover:text-red-700"
          >
            Bloğu sil
          </button>
        </form>
      </div>

      {silDurum.hata && (
        <p className="border-b border-slate-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {silDurum.hata}
        </p>
      )}

      <ul className="divide-y divide-slate-100">
        {blok.units.map((daire) =>
          duzenlenen === daire.id ? (
            <li key={daire.id} className="p-4">
              <DaireDuzenle daire={daire} kapat={() => setDuzenlenen(null)} />
            </li>
          ) : (
            <li
              key={daire.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
            >
              <span className="w-16 font-medium">{daire.kapi_no}</span>
              <span className={daire.kiraci_adi ? "" : "text-slate-400"}>
                {daire.kiraci_adi ?? "kiracı girilmedi"}
              </span>
              <span className="text-slate-500">{daire.kiraci_telefon ?? "—"}</span>
              {!daire.aktif && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  pasif
                </span>
              )}
              <button
                onClick={() => setDuzenlenen(daire.id)}
                className="ml-auto rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                Düzenle
              </button>
            </li>
          ),
        )}
      </ul>

      <form
        action={ekleAction}
        className="flex flex-wrap items-start gap-2 border-t border-slate-100 bg-slate-50 p-4"
      >
        <input type="hidden" name="block_id" value={blok.id} />
        <input name="kapi_no" required placeholder="Kapı no" className={girdi + " w-28"} />
        <input name="kiraci_adi" placeholder="Kiracı adı" className={girdi + " w-48"} />
        <input
          name="kiraci_telefon"
          placeholder="0532 111 22 33"
          className={girdi + " w-44"}
        />
        <GonderButonu bekleyen="Ekleniyor…">Daire ekle</GonderButonu>
        {ekleDurum.hata && <p className="w-full text-sm text-red-700">{ekleDurum.hata}</p>}
      </form>
    </section>
  );
}

function DaireDuzenle({ daire, kapat }: { daire: Unit; kapat: () => void }) {
  const [guncelleDurum, guncelleAction] = useActionState(daireGuncelle, BOS);
  const [silDurum, silAction] = useActionState(daireSil, BOS);
  const [silOnay, setSilOnay] = useState(false);

  return (
    <div className="space-y-3">
      <form action={guncelleAction} className="space-y-3">
        <input type="hidden" name="id" value={daire.id} />

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Kapı no</span>
            <input name="kapi_no" required defaultValue={daire.kapi_no} className={girdi} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Kiracı adı</span>
            <input name="kiraci_adi" defaultValue={daire.kiraci_adi ?? ""} className={girdi} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Telefon</span>
            <input
              name="kiraci_telefon"
              defaultValue={daire.kiraci_telefon ?? ""}
              placeholder="0532 111 22 33"
              className={girdi}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Not</span>
          <input name="notlar" defaultValue={daire.notlar ?? ""} className={girdi} />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="aktif" defaultChecked={daire.aktif} />
          Aktif (pasif daireler panelde gösterilmez)
        </label>

        <div className="flex items-center gap-2">
          <GonderButonu>Kaydet</GonderButonu>
          <button
            type="button"
            onClick={kapat}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
          >
            Vazgeç
          </button>
        </div>
        {guncelleDurum.hata && <p className="text-sm text-red-700">{guncelleDurum.hata}</p>}
      </form>

      <div className="border-t border-slate-100 pt-3">
        {silOnay ? (
          <form action={silAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={daire.id} />
            <span className="text-sm text-red-700">
              Bu dairenin tüm fatura ve dekont geçmişi silinecek. Emin misiniz?
            </span>
            <button
              type="submit"
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
            >
              Evet, sil
            </button>
            <button
              type="button"
              onClick={() => setSilOnay(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
            >
              Vazgeç
            </button>
          </form>
        ) : (
          <button
            onClick={() => setSilOnay(true)}
            className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-red-50 hover:text-red-700"
          >
            Daireyi sil
          </button>
        )}
        {silDurum.hata && <p className="mt-2 text-sm text-red-700">{silDurum.hata}</p>}
      </div>
    </div>
  );
}
