from dekont_regex import dekont_ayristir, metin_cikar
from sema import DekontSemasi

GORSEL_MIME = frozenset({"image/jpeg", "image/png", "image/webp", "image/gif"})


def mime_desteklenir_mi(mime: str) -> bool:
    return mime == "application/pdf" or mime in GORSEL_MIME


async def dekont_oku(icerik: bytes, mime: str) -> DekontSemasi:
    """Dekonttan tutar ve diğer alanları çıkarır — AI kullanmadan.

    Metin çıkarma ya da OCR başarısız olursa (ör. Tesseract kurulu değil,
    dosya bozuk) hata fırlatmak yerine okunabilir=false ile zarifçe döner;
    çağıran taraf (app/api/ingest) bunu zaten "elle kontrol edin" olarak
    ele alıyor.
    """
    try:
        metin = metin_cikar(icerik, mime)
    except Exception as e:
        return DekontSemasi(
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

    return dekont_ayristir(metin)
