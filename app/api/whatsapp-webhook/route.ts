import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { waTelefon } from "@/lib/format";
import { wahaGonderenNumarasi, wahaMedyaIndir, type WahaMesaj } from "@/lib/waha";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * WAHA'dan gelen webhook — kiracının WhatsApp sohbetine attığı dekontu yakalar.
 *
 * Akış: numarayı daireye eşle -> o daire için en uygun faturayı bul -> medyayı
 * WAHA'dan indir -> mevcut /api/ingest'e aynen n8n gibi X-Ingest-Key ile POST
 * et. Okuma/eşleştirme mantığı burada tekrar yazılmaz.
 *
 * Eşleşmeyen/anlaşılamayan her durumda sessizce 200 dönülür — WAHA'nın
 * hata sanıp tekrar denemesine gerek yok, sadece loglanır.
 */
export async function POST(request: Request) {
  const beklenenSir = process.env.WAHA_WEBHOOK_SECRET;
  if (!beklenenSir || request.headers.get("x-webhook-secret") !== beklenenSir) {
    return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });
  }

  let govde: { event?: string; payload?: WahaMesaj };
  try {
    govde = await request.json();
  } catch {
    return NextResponse.json({ tamam: true, atlandi: "gecersiz-govde" });
  }

  const mesaj = govde.payload;
  if (!mesaj || mesaj.fromMe || !mesaj.hasMedia || !mesaj.media?.url) {
    return NextResponse.json({ tamam: true, atlandi: "ilgisiz-mesaj" });
  }

  const admin = getAdminSupabase();

  // WAHA ağ sorunu ya da zaman aşımı sonrası aynı çağrıyı tekrar deneyebilir.
  // Mesaj id'si benzersiz kısıtına takılırsa bu daha önce işlenmiş demektir —
  // aynı dekont ikinci kez eklenip kümülatif toplamı şişirmesin diye burada
  // kesilir.
  if (mesaj.id) {
    const { error: tekrarHatasi } = await admin
      .from("processed_wa_messages")
      .insert({ message_id: mesaj.id });

    if (tekrarHatasi) {
      if (tekrarHatasi.code === "23505") {
        return NextResponse.json({ tamam: true, atlandi: "zaten-islendi" });
      }
      console.error("[whatsapp-webhook] tekrar-onleme kaydı yazılamadı:", tekrarHatasi.message);
    }
  }

  const hamNumara = wahaGonderenNumarasi(mesaj);
  const gonderenNumara = waTelefon(hamNumara);
  if (!gonderenNumara) {
    console.warn("[whatsapp-webhook] gönderen numarası çözülemedi:", mesaj.from);
    return NextResponse.json({ tamam: true, atlandi: "numara-cozulemedi" });
  }

  const { data: daireler, error: daireHatasi } = await admin
    .from("units")
    .select("id, kiraci_telefon")
    .not("kiraci_telefon", "is", null);

  if (daireHatasi) {
    console.error("[whatsapp-webhook] daireler sorgulanamadı:", daireHatasi.message);
    return NextResponse.json({ tamam: true, atlandi: "sorgu-hatasi" });
  }

  const daire = (daireler ?? []).find(
    (d) => waTelefon(d.kiraci_telefon) === gonderenNumara,
  );
  if (!daire) {
    console.warn("[whatsapp-webhook] numaraya eşleşen daire yok:", gonderenNumara);
    return NextResponse.json({ tamam: true, atlandi: "daire-eslesmedi" });
  }

  // Önce bu daire için ödeme bekleyen bir fatura ara; yoksa en güncel faturaya düş.
  const { data: bekleyenFatura } = await admin
    .from("invoices")
    .select("id")
    .eq("unit_id", daire.id)
    .in("durum", ["gonderildi", "uyusmadi"])
    .order("donem", { ascending: false })
    .limit(1)
    .maybeSingle();

  const fatura =
    bekleyenFatura ??
    (
      await admin
        .from("invoices")
        .select("id")
        .eq("unit_id", daire.id)
        .order("donem", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data;

  if (!fatura) {
    console.warn("[whatsapp-webhook] daire için fatura bulunamadı:", daire.id);
    return NextResponse.json({ tamam: true, atlandi: "fatura-yok" });
  }

  const medya = await wahaMedyaIndir(mesaj.media.url);
  if (!medya) {
    console.error("[whatsapp-webhook] medya indirilemedi:", mesaj.media.url);
    return NextResponse.json({ tamam: true, atlandi: "medya-indirilemedi" });
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(medya.veri)], { type: medya.mimetype }),
    mesaj.media.filename || medya.filename,
  );
  form.append("invoice_id", fatura.id);

  const ingestKey = process.env.INGEST_API_KEY;
  if (!ingestKey) {
    console.error("[whatsapp-webhook] INGEST_API_KEY tanımlı değil, ingest çağrılamadı.");
    return NextResponse.json({ tamam: true, atlandi: "ingest-anahtari-yok" });
  }

  const ingestYaniti = await fetch(new URL("/api/ingest", request.url), {
    method: "POST",
    headers: { "X-Ingest-Key": ingestKey },
    body: form,
  });

  const sonuc = await ingestYaniti.json().catch(() => ({}));
  return NextResponse.json({ tamam: true, ingest: sonuc });
}
