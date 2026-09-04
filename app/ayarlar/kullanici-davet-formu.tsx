"use client";

import { useActionState } from "react";
import { kullaniciDavetEt, type ActionSonuc } from "./actions";

const BOS: ActionSonuc = {};

export default function KullaniciDavetFormu() {
  const [durum, gonder, bekliyor] = useActionState(kullaniciDavetEt, BOS);

  return (
    <form action={gonder} className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[200px]">
        <label htmlFor="eposta" className="mb-1 block text-sm font-medium">
          E-posta
        </label>
        <input
          id="eposta"
          name="eposta"
          type="email"
          required
          placeholder="ornek@eposta.com"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-900"
        />
      </div>

      <div>
        <label htmlFor="rol" className="mb-1 block text-sm font-medium">
          Rol
        </label>
        <select
          id="rol"
          name="rol"
          defaultValue="goruntuleyici"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
        >
          <option value="goruntuleyici">Görüntüleyici (salt okunur)</option>
          <option value="yonetici">Yönetici (tam yetki)</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={bekliyor}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {bekliyor ? "Gönderiliyor…" : "Davet gönder"}
      </button>

      {durum.hata && (
        <p className="w-full text-sm text-red-700">{durum.hata}</p>
      )}
      {durum.basari && (
        <p className="w-full text-sm text-emerald-700">{durum.basari}</p>
      )}
    </form>
  );
}
