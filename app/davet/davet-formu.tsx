"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function DavetFormu() {
  const router = useRouter();
  const [sifre, setSifre] = useState("");
  const [sifreTekrar, setSifreTekrar] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);

    if (sifre.length < 8) {
      setHata("Şifre en az 8 karakter olmalı.");
      return;
    }
    if (sifre !== sifreTekrar) {
      setHata("Şifreler eşleşmiyor.");
      return;
    }

    setBekliyor(true);
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.updateUser({ password: sifre });

    if (error) {
      setHata(error.message);
      setBekliyor(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={gonder} className="space-y-4">
      <div>
        <label htmlFor="sifre" className="mb-1 block text-sm font-medium">
          Şifre
        </label>
        <input
          id="sifre"
          type="password"
          required
          autoComplete="new-password"
          value={sifre}
          onChange={(e) => setSifre(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
      </div>

      <div>
        <label htmlFor="sifreTekrar" className="mb-1 block text-sm font-medium">
          Şifre (tekrar)
        </label>
        <input
          id="sifreTekrar"
          type="password"
          required
          autoComplete="new-password"
          value={sifreTekrar}
          onChange={(e) => setSifreTekrar(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
      </div>

      {hata && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{hata}</p>
      )}

      <button
        type="submit"
        disabled={bekliyor}
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {bekliyor ? "Kaydediliyor…" : "Şifreyi kaydet ve devam et"}
      </button>
    </form>
  );
}
