"""Regex/OCR tamamen okuyamadığında devreye giren OPSİYONEL Google Gemini
fallback'i.

Regex hattı (dekont_regex.py) sıfır API maliyeti için tercih edilen birincil
yol olmaya devam ediyor — bu modül yalnızca regex'in hiçbir tutar/kanıt
bulamadığı (okunabilir=false) durumlarda, dekont_oku.py tarafından bir kez
denenir. GOOGLE_AI_API_KEY tanımlı değilse hiç denenmez, servis eskisi gibi
regex-only çalışmaya devam eder — bu bir güvenlik sınırı değil bir
zenginleştirme olduğu için fail-*open* (bkz. main.py'deki DEKONT_SERVICE_KEY,
o ise bilerek fail-*closed*).

ÖNEMLİ SINIR: Buradan dönen sonuç da dahil olmak üzere HER dekont, aynı
IBAN/tarih/referans-no/tekrar-kullanım kontrollerinden geçer (bkz.
lib/esles.ts, app/api/ingest/route.ts). Bu modül yalnızca "okunamadı"yı
"okundu, şimdi normal kurallarla değerlendir"e çevirir — hiçbir doğrulamayı
bypass etmez. Bu yüzden IBAN uyuşmazlığı, tekrar kullanım, tarih/tutar
uyuşmazlığı gibi durumlarda hiç çağrılmaz (bkz. dekont_oku.py): oralardaki
sorun okuma hatası değil, doğru okunmuş bir değerin kuralla çelişmesi.

SDK sözleşmesi (google-genai'nin "Interactions" API'si) 2026-09 itibarıyla
resmi dokümantasyondan (ai.google.dev/gemini-api/docs/interactions/*)
doğrulanmıştır; SDK hızlı değiştiği için gelecekte tekrar kontrol edilmeli.
"""

import asyncio
import base64
import os
from typing import Optional

from google import genai

from sema import DekontSemasi

GOOGLE_AI_API_KEY = os.environ.get("GOOGLE_AI_API_KEY")
GOOGLE_AI_MODEL = os.environ.get("GOOGLE_AI_MODEL", "gemini-3.6-flash")

# app/api/ingest/route.ts'deki 55 sn'lik toplam bütçeyi (AbortSignal.timeout)
# tek başına tüketmesin diye açık bir üst sınır. İkili koruma: hem create()'in
# kendi `timeout` parametresi hem asyncio.wait_for — SDK'nin timeout
# davranışının güvenilmez olduğu bilinen durumlar var (bkz. googleapis/
# python-genai GitHub issue'ları), o yüzden asyncio tarafı asıl güvence.
ZAMAN_ASIMI_SANIYE = 25

# sema.py'deki alan açıklamalarıyla kasıtlı olarak tutarlı — aynı sözleşme,
# farklı okuyucu (bkz. modül docstring'i).
_PROMPT = """Bu bir banka dekontu/ödeme makbuzu görseli ya da PDF'idir. \
Aşağıdaki alanları JSON olarak çıkar:

- okunabilir: Bu dosya gerçekten bir para transferi dekontu/makbuzu mu ve \
tutarı net okunabiliyor mu?
- tutar: Gönderilen ANA tutar, sayı olarak. İşlem ücreti, bakiye, limit gibi \
diğer tutarları ALMA. Okunamıyorsa null.
- para_birimi: TRY, USD, EUR gibi. Bilinmiyorsa null.
- tarih: İşlem tarihi, YYYY-MM-DD biçiminde. Yoksa null.
- alici_iban: Paranın GİTTİĞİ (alıcı) IBAN, boşluksuz. Emin olunamıyorsa null.
- alici_ad: Alıcı/lehtar adı. Yoksa null.
- gonderen_ad: Gönderen kişinin adı. Yoksa null.
- banka: Dekontu düzenleyen banka. Yoksa null.
- referans_no: Bankanın işleme verdiği tekil numara (Referans No, İşlem No, \
Dekont No, Fiş No, Sorgu No gibi etiketlerle geçer). Emin olunamıyorsa null.
- aciklama: okunabilir=false ise nedenini tek cümleyle Türkçe yaz; \
okunabilir=true ise kısa bir özet yaz.

Bu dosya bir para transferi dekontu DEĞİLSE (fatura, sipariş özeti, sohbet \
ekran görüntüsü, alakasız belge vb.) okunabilir=false döndür."""


def _girdi_turu(mime: str) -> str:
    return "document" if mime == "application/pdf" else "image"


async def gemini_ile_oku(icerik: bytes, mime: str) -> Optional[DekontSemasi]:
    """Regex başarısız olduğunda bir kez denenen fallback.

    Anahtar tanımlı değilse, zaman aşımına uğrarsa ya da herhangi bir hata
    olursa (geçersiz anahtar, quota, network, beklenmeyen yanıt biçimi)
    sessizce None döner — çağıran taraf bunu "AI da başaramadı" olarak ele
    alır, istek asla patlamaz; regex'in "okunamadı" sonucu dekont_oku.py'de
    olduğu gibi korunur.
    """
    if not GOOGLE_AI_API_KEY:
        return None

    try:
        client = genai.Client(api_key=GOOGLE_AI_API_KEY)
        istek = client.aio.interactions.create(
            model=GOOGLE_AI_MODEL,
            input=[
                {"type": "text", "text": _PROMPT},
                {
                    "type": _girdi_turu(mime),
                    "data": base64.b64encode(icerik).decode("utf-8"),
                    "mime_type": mime,
                },
            ],
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": DekontSemasi.model_json_schema(),
            },
            timeout=ZAMAN_ASIMI_SANIYE,
        )
        interaction = await asyncio.wait_for(istek, timeout=ZAMAN_ASIMI_SANIYE)
        sonuc = DekontSemasi.model_validate_json(interaction.output_text)
    except Exception:
        return None

    sonuc.aciklama = (
        f"{sonuc.aciklama} (Google Gemini ile okundu.)"
        if sonuc.aciklama
        else "Google Gemini ile okundu."
    )
    return sonuc
