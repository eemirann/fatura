"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { para } from "@/lib/format";

type Sonuc = {
  eslesme: "matched" | "mismatch" | "unreadable";
  okunan_tutar: number | null;
  beklenen_tutar: number;
};

export default function KiraciYukleme({ token }: { token: string }) {
  const router = useRouter();
  const dosyaRef = useRef<HTMLInputElement>(null);
  const [dosyaAdi, setDosyaAdi] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);

  async function gonder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dosya = dosyaRef.current?.files?.[0];
    if (!dosya) return;

    setYukleniyor(true);
    setHata(null);
    setSonuc(null);

    const govde = new FormData();
    govde.set("token", token);
    govde.set("file", dosya);

    try {
      const cevap = await fetch("/api/ingest", { method: "POST", body: govde });
      const veri = await cevap.json().catch(() => ({}));

      if (!cevap.ok) {
        setHata(veri.hata ?? "Dekont gönderilemedi. Lütfen tekrar deneyin.");
        return;
      }

      setSonuc(veri as Sonuc);
      if (dosyaRef.current) dosyaRef.current.value = "";
      setDosyaAdi(null);
      router.refresh();
    } catch {
      setHata("Bağlantı hatası. İnternetinizi kontrol edip tekrar deneyin.");
    } finally {
      setYukleniyor(false);
    }
  }

  if (sonuc) {
    return <SonucKutusu sonuc={sonuc} yeniden={() => setSonuc(null)} />;
  }

  return (
    <form onSubmit={gonder} className="space-y-3">
      <label
        className={
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors " +
          (dosyaAdi
            ? "border-slate-900 bg-slate-50"
            : "border-slate-300 hover:border-slate-400")
        }
      >
        <input
          ref={dosyaRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          required
          className="sr-only"
          onChange={(e) => setDosyaAdi(e.target.files?.[0]?.name ?? null)}
        />
        {dosyaAdi ? (
          <>
            <span className="text-sm font-medium break-all">{dosyaAdi}</span>
            <span className="mt-1 text-xs text-slate-500">
              Değiştirmek için tekrar dokunun
            </span>
          </>
        ) : (
          <>
            <span className="text-sm font-medium">Dosya seçin veya fotoğraf çekin</span>
            <span className="mt-1 text-xs text-slate-500">PDF, JPG, PNG · en fazla 10 MB</span>
          </>
        )}
      </label>

      {hata && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{hata}</p>
      )}

      <button
        type="submit"
        disabled={yukleniyor || !dosyaAdi}
        className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
      >
        {yukleniyor ? "Dekont okunuyor…" : "Dekontu gönder"}
      </button>

      {yukleniyor && (
        <p className="text-center text-xs text-slate-500">
          Bu işlem birkaç saniye sürebilir, sayfayı kapatmayın.
        </p>
      )}
    </form>
  );
}

function SonucKutusu({ sonuc, yeniden }: { sonuc: Sonuc; yeniden: () => void }) {
  const kutular = {
    matched: {
      sinif: "border-emerald-200 bg-emerald-50 text-emerald-900",
      baslik: "Dekontunuz alındı, teşekkürler.",
      metin: `Tutar (${para(sonuc.okunan_tutar)}) doğrulandı ve ödemeniz kaydedildi.`,
    },
    mismatch: {
      sinif: "border-orange-200 bg-orange-50 text-orange-900",
      baslik: "Dekontunuz alındı, ancak tutar uyuşmuyor.",
      metin: `Dekontta ${para(sonuc.okunan_tutar)} görünüyor, beklenen tutar ${para(
        sonuc.beklenen_tutar,
      )}. Ev sahibiniz kontrol edecek.`,
    },
    unreadable: {
      sinif: "border-slate-200 bg-slate-50 text-slate-800",
      baslik: "Dekontunuz alındı.",
      metin:
        "Tutar otomatik okunamadı, ev sahibiniz dekontu elle kontrol edecek. " +
        "Dilerseniz daha net bir görüntü gönderebilirsiniz.",
    },
  }[sonuc.eslesme];

  return (
    <div className="space-y-3">
      <div className={`rounded-xl border px-4 py-3 ${kutular.sinif}`}>
        <p className="font-medium">{kutular.baslik}</p>
        <p className="mt-1 text-sm">{kutular.metin}</p>
      </div>
      <button
        onClick={yeniden}
        className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm hover:bg-slate-50"
      >
        Başka bir dekont gönder
      </button>
    </div>
  );
}
