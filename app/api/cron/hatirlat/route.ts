import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { wahaAktifMi } from "@/lib/waha-ayristir.ts";
import { wahaMesajGonder } from "@/lib/waha";
import { mesajOlustur, dekontLinki } from "@/lib/whatsapp";
import { isoGun } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Aynı faturaya bu kadar gün geçmeden ikinci bir hatırlatma gitmez. */
const TEKRAR_ARALIGI_GUN = 3;

/**
 * Vadesi geçmiş, ödenmemiş faturalar için WhatsApp hatırlatması gönderir.
 * Vercel Cron tarafından günlük tetiklenir (bkz. vercel.json).
 *
 * WAHA yapılandırılmamışsa (yerelde/henüz VPS yoksa) hiçbir şey yapmadan
 * "atlandı" bilgisiyle döner — otomatik gönderim olmadan mesaj atacak bir
 * yol yok, bu isteğe bağlı bir üst katman.
 */
export async function GET(request: Request) {
  const beklenenSir = process.env.CRON_SECRET;
  if (beklenenSir) {
    const yetki = request.headers.get("authorization");
    if (yetki !== `Bearer ${beklenenSir}`) {
      return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });
    }
  }

  if (!wahaAktifMi()) {
    return NextResponse.json({ tamam: true, atlandi: "waha-aktif-degil" });
  }

  const admin = getAdminSupabase();
  const bugun = isoGun();
  const tekrarSiniri = new Date(
    Date.now() - TEKRAR_ARALIGI_GUN * 86_400_000,
  ).toISOString();

  const [{ data: ayarlar }, { data: faturalar, error }] = await Promise.all([
    admin.from("settings").select("iban, hesap_sahibi, mesaj_sablonu").single(),
    admin
      .from("invoices")
      .select(
        "id, donem, toplam, son_odeme_tarihi, public_token, units(kapi_no, kiraci_adi, kiraci_telefon, blocks(ad)), invoice_items(baslik, tutar)",
      )
      .in("durum", ["gonderildi", "uyusmadi"])
      .lt("son_odeme_tarihi", bugun)
      .or(`son_hatirlatma_at.is.null,son_hatirlatma_at.lt.${tekrarSiniri}`),
  ]);

  if (error) return NextResponse.json({ hata: error.message }, { status: 500 });
  if (!ayarlar) return NextResponse.json({ hata: "Ayarlar bulunamadı." }, { status: 500 });

  const sonuclar: { fatura_id: string; basari: boolean; detay?: string }[] = [];

  for (const f of faturalar ?? []) {
    const unit = Array.isArray(f.units) ? f.units[0] : f.units;
    if (!unit?.kiraci_telefon) {
      sonuclar.push({ fatura_id: f.id, basari: false, detay: "telefon-yok" });
      continue;
    }
    const blockRel = Array.isArray(unit.blocks) ? unit.blocks[0] : unit.blocks;

    const mesaj =
      "⏰ Hatırlatma:\n\n" +
      mesajOlustur({
        sablon: ayarlar.mesaj_sablonu,
        kiraciAdi: unit.kiraci_adi,
        blokAdi: blockRel?.ad ?? "",
        kapiNo: unit.kapi_no,
        donem: f.donem,
        kalemler: f.invoice_items ?? [],
        toplam: Number(f.toplam),
        sonOdemeTarihi: f.son_odeme_tarihi,
        iban: ayarlar.iban,
        hesapSahibi: ayarlar.hesap_sahibi,
        dekontLinki: dekontLinki(f.public_token),
      });

    const sonuc = await wahaMesajGonder(unit.kiraci_telefon, mesaj);
    sonuclar.push({ fatura_id: f.id, basari: sonuc.basari, detay: sonuc.basari ? undefined : sonuc.hata });

    if (sonuc.basari) {
      await admin
        .from("invoices")
        .update({ son_hatirlatma_at: new Date().toISOString() })
        .eq("id", f.id);
    }
  }

  return NextResponse.json({
    tamam: true,
    kontrolEdilen: faturalar?.length ?? 0,
    gonderilen: sonuclar.filter((s) => s.basari).length,
    sonuclar,
  });
}
