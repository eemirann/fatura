from dekont_gemini import gemini_ile_oku
from dekont_gorsel import gorsel_hash_hesapla
from dekont_regex import dekont_ayristir, metin_cikar
from sema import DekontSemasi

GORSEL_MIME = frozenset({"image/jpeg", "image/png", "image/webp", "image/gif"})


def mime_desteklenir_mi(mime: str) -> bool:
    return mime == "application/pdf" or mime in GORSEL_MIME


async def dekont_oku(icerik: bytes, mime: str) -> DekontSemasi:
    """Dekonttan tutar ve diğer alanları çıkarır.

    Birincil yol regex/OCR (AI kullanmaz, ücretsiz). Metin çıkarma ya da OCR
    başarısız olursa (ör. Tesseract kurulu değil, dosya bozuk) ya da regex
    hiçbir tutar/kanıt bulamazsa, hata fırlatmak yerine okunabilir=false ile
    zarifçe döner — ANCAK bu iki durumda da önce opsiyonel bir Gemini
    fallback'i denenir (bkz. dekont_gemini.py). GOOGLE_AI_API_KEY tanımlı
    değilse bu deneme anında None döner, davranış tamamen eskisi gibi kalır.

    Fallback yalnızca "okunamadı" durumunda çalışır — IBAN uyuşmazlığı,
    tekrar kullanım, tarih/tutar uyuşmazlığı gibi durumlarda hiç çağrılmaz;
    çağıran taraf (app/api/ingest) zaten "okunamadı"yı "elle kontrol edin"
    olarak ele alıyor, fallback yalnızca bu yığını küçültüyor.
    """
    try:
        metin = metin_cikar(icerik, mime)
    except Exception as e:
        sonuc = DekontSemasi(
            okunabilir=False,
            tutar=None,
            para_birimi=None,
            tarih=None,
            alici_iban=None,
            alici_ad=None,
            gonderen_ad=None,
            banka=None,
            aciklama=f"Metin/OCR okuma başarısız oldu: {e}",
        )
        sonuc = await gemini_ile_oku(icerik, mime) or sonuc
        sonuc.gorsel_hash = gorsel_hash_hesapla(icerik, mime)
        return sonuc

    sonuc = dekont_ayristir(metin)
    if not sonuc.okunabilir:
        sonuc = await gemini_ile_oku(icerik, mime) or sonuc
    # Görsel hash metinden bağımsız: OCR metni boş/başarısız olsa bile (ör.
    # taranmış ama tanınamayan bir görsel) tekrar-kullanım tespiti için yine
    # de hesaplanmaya değer. Hata durumunda sessizce None kalır.
    sonuc.gorsel_hash = gorsel_hash_hesapla(icerik, mime)
    return sonuc
