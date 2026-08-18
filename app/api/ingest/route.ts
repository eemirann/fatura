import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import {
  dekontOku,
  mimeDesteklenirMi,
  type DekontOkuma,
  type DesteklenenMime,
} from "@/lib/dekont-oku.ts";
import { eslestir, type EslesmeSonucu } from "@/lib/esles.ts";
import type { ReceiptKaynak } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const AZAMI_BOYUT = 10 * 1024 * 1024; // 10 MB — storage bucket limitiyle aynı
const FATURA_BASINA_AZAMI_DEKONT = 15;

const UZANTI: Record<DesteklenenMime, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function hata(mesaj: string, kod = 400) {
  return NextResponse.json({ hata: mesaj }, { status: kod });
}

/**
 * Dekont giriş noktası — üç kaynağı da tek yerden karşılar:
 *
 *   1. Kiracı, WhatsApp mesajındaki linkten     -> form alanı: token
 *   2. Ev sahibi, panelden                       -> form alanı: invoice_id + oturum çerezi
 *   3. n8n / otomasyon (ileride)                 -> X-Ingest-Key başlığı + token veya invoice_id
 *
 * n8n eklendiğinde panel kodunun değişmesi gerekmez; aynı sözleşmeye POST eder.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return hata("Geçersiz istek gövdesi.");
  }

  const dosya = form.get("file");
  if (!(dosya instanceof File)) return hata("Dekont dosyası bulunamadı.");
  if (dosya.size === 0) return hata("Dosya boş.");
  if (dosya.size > AZAMI_BOYUT) return hata("Dosya 10 MB sınırını aşıyor.");

  const mime = dosya.type || "application/octet-stream";
  if (!mimeDesteklenirMi(mime)) {
    return hata(
      mime === "image/heic" || mime === "image/heif"
        ? "iPhone HEIC formatı okunamıyor. Lütfen ekran görüntüsü olarak (PNG/JPG) veya PDF gönderin."
        : "Yalnızca PDF, JPG, PNG ve WebP dosyaları kabul edilir.",
    );
  }

  const token = String(form.get("token") ?? "").trim();
  const invoiceId = String(form.get("invoice_id") ?? "").trim();
  const ingestKey = request.headers.get("x-ingest-key");
  const beklenenKey = process.env.INGEST_API_KEY;
  const otomasyon = Boolean(beklenenKey && ingestKey && ingestKey === beklenenKey);

  if (!token && !invoiceId) return hata("token veya invoice_id gerekli.");

  // service_role: kiracı akışında oturum yok, yetkiyi token sağlıyor.
  const admin = getAdminSupabase();

  // ---------------------------------------------------------- faturayı bul + yetki
  let kaynak: ReceiptKaynak;
  const sorgu = admin
    .from("invoices")
    .select("id, unit_id, toplam, durum")
    .limit(1);

  if (token) {
    kaynak = otomasyon ? "api" : "kiraci_link";
    sorgu.eq("public_token", token);
  } else {
    // invoice_id ile yükleme yalnızca giriş yapmış ev sahibine ya da
    // doğrulanmış otomasyona açık — aksi hâlde id tahmin edilebilir olurdu.
    if (!otomasyon) {
      const user = await getUser();
      if (!user) return hata("Bu işlem için giriş yapmalısınız.", 401);
    }
    kaynak = otomasyon ? "api" : "panel";
    sorgu.eq("id", invoiceId);
  }

  const { data: fatura, error: faturaHatasi } = await sorgu.maybeSingle();
  if (faturaHatasi) return hata("Fatura sorgulanamadı.", 500);
  if (!fatura) return hata("Fatura bulunamadı. Bağlantı geçersiz olabilir.", 404);

  // Açık uçlu yükleme adresinin kötüye kullanılmasını sınırla.
  const { count } = await admin
    .from("receipts")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", fatura.id);

  if ((count ?? 0) >= FATURA_BASINA_AZAMI_DEKONT) {
    return hata("Bu fatura için dekont yükleme sınırına ulaşıldı.", 429);
  }

  // ------------------------------------------------------------- dosyayı sakla
  const icerik = Buffer.from(await dosya.arrayBuffer());
  const dosyaYolu = `${fatura.id}/${Date.now()}-${crypto.randomUUID()}.${UZANTI[mime]}`;

  const { error: yuklemeHatasi } = await admin.storage
    .from("dekontlar")
    .upload(dosyaYolu, icerik, { contentType: mime, upsert: false });

  if (yuklemeHatasi) {
    return hata("Dosya yüklenemedi: " + yuklemeHatasi.message, 500);
  }

  // ------------------------------------------------------------- Claude ile oku
  // Okuma başarısız olsa bile dekont kaydedilir; dosya kaybolmasın, ev sahibi
  // açıp elle bakabilsin.
  const beklenenTutar = Number(fatura.toplam);

  let okuma: DekontOkuma | null = null;
  try {
    okuma = await dekontOku(icerik, mime);
  } catch (e) {
    console.error("[ingest] dekont okunamadı:", e instanceof Error ? e.message : e);
  }

  let eslesmeSonucu: EslesmeSonucu;
  if (okuma) {
    const { data: ayarlar } = await admin.from("settings").select("iban").single();
    eslesmeSonucu = eslestir(okuma, beklenenTutar, ayarlar?.iban ?? "");
  } else {
    eslesmeSonucu = {
      eslesme: "unreadable",
      yeniDurum: null,
      aciklama: "Otomatik okuma başarısız oldu. Dekontu açıp elle kontrol edin.",
    };
  }

  // ---------------------------------------------------------------- kaydet
  const { error: kayitHatasi } = await admin.from("receipts").insert({
    invoice_id: fatura.id,
    dosya_yolu: dosyaYolu,
    dosya_adi: dosya.name || null,
    mime,
    boyut: dosya.size,
    kaynak,
    eslesme: eslesmeSonucu.eslesme,
    okunan_tutar: okuma?.tutar ?? null,
    okunan_tarih: gecerliTarih(okuma?.tarih),
    okunan_iban: okuma?.alici_iban ?? null,
    okunan_alici: okuma?.alici_ad ?? null,
    okunan_gonderen: okuma?.gonderen_ad ?? null,
    okunan_banka: okuma?.banka ?? null,
    aciklama: eslesmeSonucu.aciklama,
    ham_json: okuma,
  });

  if (kayitHatasi) {
    return hata("Dekont kaydedilemedi: " + kayitHatasi.message, 500);
  }

  // ------------------------------------------------------- faturanın durumu
  if (eslesmeSonucu.yeniDurum) {
    const guncelleme: Record<string, unknown> = { durum: eslesmeSonucu.yeniDurum };
    // Eşleşen ödemede rozet açık kalsın: ev sahibi dekonta bakınca düşürür.
    if (eslesmeSonucu.yeniDurum === "odendi") guncelleme.incelendi_at = null;

    const { error: durumHatasi } = await admin
      .from("invoices")
      .update(guncelleme)
      .eq("id", fatura.id);

    if (durumHatasi) console.error("[ingest] durum güncellenemedi:", durumHatasi.message);
  }

  return NextResponse.json({
    tamam: true,
    eslesme: eslesmeSonucu.eslesme,
    okunan_tutar: okuma?.tutar ?? null,
    beklenen_tutar: beklenenTutar,
    aciklama: eslesmeSonucu.aciklama,
  });
}

/** Model bazen "15.08.2026" gibi biçim döndürebilir; sadece ISO kabul edilir. */
function gecerliTarih(deger: string | null | undefined): string | null {
  if (!deger) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(deger.trim()) ? deger.trim() : null;
}
