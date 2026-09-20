"""Dekont metnini AI kullanmadan, regex/kural tabanlı ayrıştırır.

Akış: metin_cikar() dosyadan düz metin çıkarır (PDF'ten doğrudan, taranmış
PDF/görselden Tesseract OCR ile) -> dekont_ayristir() bu metinden alanları
regex'le çeker. Claude'un yaptığı akıl yürütmenin kaba bir yaklaşımıdır;
bilinmeyen banka formatlarında isabet düşebilir. Bu kasıtlı bir ödünleşim —
sıfır AI/API maliyeti karşılığında. Uygulama zaten "okuma başarısız/şüpheli
-> elle kontrol edin" akışını (bkz. lib/esles.ts) ana güvenlik ağı olarak
tasarladığından yanlış okuma veri kaybettirmez.
"""

import io
import re
from datetime import datetime
from typing import Optional

import pymupdf as fitz
import pytesseract
from PIL import Image

from sema import DekontSemasi

MIN_METIN_UZUNLUGU = 20  # bunun altı "muhtemelen taranmış PDF" sayılır
BOZUK_KARAKTER_ORANI = 0.02  # bunun üstü "font kodlaması bozuk" sayılır (OCR'a düşülür)

# Ham metin, okuma başarısız olduğunda deseni düzeltebilmek için saklanır
# (bkz. sema.ham_metin). Tek sayfalık bir dekont birkaç bin karakter; sınır
# çok sayfalı/bozuk OCR çıktısının veritabanını şişirmesini engelliyor.
HAM_METIN_AZAMI = 10_000

MIKTAR_DESENI = re.compile(
    r"(\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,3}(?:\.\d{3})+|\d+,\d{2}|\d+)\s*(TL|TRY|₺|USD|\$|EUR|€)?",
    re.IGNORECASE,
)
TARIH_DESENI = re.compile(r"(\d{1,2})[./](\d{1,2})[./](\d{2,4})")
IBAN_DESENI = re.compile(r"TR\d{2}(?:\s?\d{4}){5}\s?\d{2}")

# Öncelik sırası önemli: karşı tarafa GEÇEN tutar, ücret dahil toplamdan
# önce gelmeli. Faturaya karşılık gelen, ev sahibinin hesabına giren tutardır;
# gönderenin ödediği ücret/komisyon fatura borcunu kapatmaz.
TUTAR_ETIKET_ONCELIK = [
    # 1a. "Ücret Hariç" (Akbank ÜCH): aynı satırda genelde başka bir sütunun
    # tutarı da bulunduğundan satırdaki SON eşleşme alınır.
    (["ücret hariç", "üch", "şch"], "son"),  # "şch": bazı font kodlamalarında Ü->Ş bozuluyor
    # 1b. İş Bankası e-Dekont'unda aynı kavramın adı "Aktarılan Tutar" —
    # ücret ayrı kalem, "Toplam Tutar" ikisinin toplamı. Burada SON değil İLK
    # eşleşme alınır: sütunlar tek satıra birleşirse ücret sağda kalır.
    (["aktarılan tutar", "aktarilan tutar"], "ilk"),
    # 2. Transferin kendi tutarı.
    (
        [
            "işlem tutarı",
            "gönderilen tutar",
            "transfer tutarı",
            "havale tutarı",
            "eft tutarı",
            "ödeme tutarı",
            "gönderilecek tutar",
        ],
        "ilk",
    ),
    # 3. "Genel toplam", "ara toplam"dan ayrı tutulur — ikisi aynı grupta olsa
    # belgede önce geçen "Ara Toplam" kazanırdı (KDV öncesi tutar).
    (["genel toplam"], "ilk"),
    # 4. Son çare: düz toplam. Ücret dahil olabilir, o yüzden en sonda.
    (["toplam tutar", "toplam"], "ilk"),
    (["tutar"], "ilk"),
]
# "ara toplam" burada: "toplam" etiketiyle eşleşen satırları elemek için tek yol
# (etiket listesine eklenemez, çünkü kendisi "toplam" içeriyor).
TUTAR_HARIC_KELIMELER = [
    "ücret",
    "masraf",
    "bakiye",
    "limit",
    "komisyon",
    "vergi",
    "kesinti",
    "ara toplam",
    "bsmv",
]
TUTAR_SATIR_ARAMA_DERINLIGI = 3  # etiketten sonra kaç satır ileriye bakılacak (tablo düzenleri için)

ALICI_ETIKETLERI = ["alıcı adı", "alıcı unvanı", "alıcı", "lehtar", "lehdar"]
GONDEREN_ETIKETLERI = [
    "gönderen adı",
    "gönderen",
    "gönderici",
    "hesap sahibi",
    "müşteri adı",
    "amir",  # resmi bankacılık terimi: havale/EFT emrini veren taraf
]
# Bazı dekontlarda gönderen/alıcı adı ayrı etiketlenmez, aynı jenerik etiket
# (ör. "Adı Soyadı/Unvan") iki kez art arda geçer — sırasıyla gönderen, alıcı.
GENEL_ISIM_ETIKETLERI = ["adı soyadı", "ad soyad", "unvan"]

BILINEN_BANKALAR = [
    "Türkiye İş Bankası", "İş Bankası", "Garanti BBVA", "Garanti Bankası", "Akbank",
    "Yapı Kredi", "Ziraat Bankası", "Halkbank", "VakıfBank", "QNB Finansbank", "QNB",
    "DenizBank", "TEB", "ING Bank", "ING", "HSBC", "Enpara", "Papara", "Fibabanka",
    "Odeabank", "Şekerbank", "Kuveyt Türk", "Albaraka",
]


# --------------------------------------------------------------- metin çıkarma
def metin_cikar(icerik: bytes, mime: str) -> str:
    if mime == "application/pdf":
        metin = _pdf_metni(icerik)
        if len(metin.strip()) >= MIN_METIN_UZUNLUGU and not _kodlama_bozuk_mu(metin):
            return metin
        return _pdf_ocr(icerik)  # taranmış PDF ya da bozuk font kodlaması
    return _gorsel_ocr(icerik)


def _kodlama_bozuk_mu(metin: str) -> bool:
    """Bazı bankaların PDF'lerinde Türkçe karakterler (İ,ı,ş,ğ,ü,ç) için
    font'un ToUnicode haritası bozuk oluyor; bu karakterler "�" olarak
    çıkıyor. Metin uzun olsa bile bu oranda çoksa metin güvenilmez — OCR'a
    düşülür (Tesseract sayfayı görsel olarak okuduğu için bu sorunu yaşamaz).
    """
    if not metin:
        return False
    return metin.count("�") / len(metin) > BOZUK_KARAKTER_ORANI


def _pdf_metni(icerik: bytes) -> str:
    """Metni, PDF'in KENDİ blok/satır yapısına göre kurar.

    `get_text("words")` her kelime için (blok no, satır no, kelime no) da
    döndürür — bunlar PDF'in gömülü metin yapısıdır. Kelimeleri buna göre
    gruplamak, etiketi değerine bağlı tutar: "Aktarılan Tutar" ve
    ": 10,00 TRY" ard arda gelir.

    Daha önce burada y koordinatına göre kümeleme yapılıyordu (aynı yüksekliğe
    yakın kelimeler aynı satır sayılıyordu). Bu, gerçek bir İş Bankası
    e-Dekont'unda metni tamamen dağıttı: etiketler değerlerinden koptu, sonuç
    olarak 10,00 TL'lik transfer, sayfanın başka bir yerindeki "BSMV:1,16"
    satırından 1,16 TL okundu. Blok/satır numarası hem o dosyada doğru sonucu
    veriyor hem de çok sütunlu tablolarda sütunları ayrı tutuyor — y kümelemenin
    çözmeye çalıştığı asıl sorun buydu.
    """
    satirlar: list[str] = []
    with fitz.open(stream=icerik, filetype="pdf") as belge:
        for sayfa in belge:
            gruplar: dict[tuple[int, int], list] = {}
            for k in sayfa.get_text("words"):
                # k = (x0, y0, x1, y1, kelime, blok_no, satir_no, kelime_no)
                gruplar.setdefault((k[5], k[6]), []).append(k)
            for anahtar in sorted(gruplar):
                satirlar.append(_satir_kur(gruplar[anahtar]))
    return "\n".join(satirlar)


def _satir_kur(kelimeler: list) -> str:
    """Bir satırın kelimelerini kendi sırasına göre birleştirir (k[7] = kelime no)."""
    return " ".join(k[4] for k in sorted(kelimeler, key=lambda k: k[7]))


def _pdf_ocr(icerik: bytes) -> str:
    parcalar: list[str] = []
    with fitz.open(stream=icerik, filetype="pdf") as belge:
        for sayfa in belge:
            pix = sayfa.get_pixmap(dpi=200)
            gorsel = Image.open(io.BytesIO(pix.tobytes("png")))
            parcalar.append(pytesseract.image_to_string(gorsel, lang="tur"))
    return "\n".join(parcalar)


def _gorsel_ocr(icerik: bytes) -> str:
    gorsel = Image.open(io.BytesIO(icerik))
    return pytesseract.image_to_string(gorsel, lang="tur")


# ------------------------------------------------------------- regex ayrıştırma
def dekont_ayristir(metin: str) -> DekontSemasi:
    tutar, birim = _tutar_bul(metin)
    ham_metin = metin[:HAM_METIN_AZAMI] or None

    if tutar is None:
        return DekontSemasi(
            okunabilir=False,
            tutar=None,
            para_birimi=None,
            tarih=None,
            alici_iban=None,
            alici_ad=None,
            gonderen_ad=None,
            banka=None,
            aciklama="Metinde bir tutar bulunamadı. Dekontu açıp elle kontrol edin.",
            ham_metin=ham_metin,
        )

    para_birimi = birim or "TRY"
    alici_ad = _isim_bul(metin, ALICI_ETIKETLERI)
    gonderen_ad = _isim_bul(metin, GONDEREN_ETIKETLERI)
    if alici_ad is None and gonderen_ad is None:
        gonderen_ad, alici_ad = _iki_taraf_isim_bul(metin)

    return DekontSemasi(
        okunabilir=True,
        tutar=tutar,
        para_birimi=para_birimi,
        tarih=_tarih_bul(metin),
        alici_iban=_iban_bul(metin),
        alici_ad=alici_ad,
        gonderen_ad=gonderen_ad,
        banka=_banka_bul(metin),
        aciklama=f"{tutar:.2f} {para_birimi} tutarında işlem tespit edildi (regex/OCR).",
        ham_metin=ham_metin,
    )


def _sayi_cevir(ham: str) -> Optional[float]:
    temiz = ham.strip().replace(".", "").replace(",", ".")
    try:
        return round(float(temiz), 2)
    except ValueError:
        return None


def _para_birimi_cevir(sembol: Optional[str]) -> Optional[str]:
    if not sembol:
        return None
    s = sembol.upper()
    if s in ("TL", "TRY", "₺"):
        return "TRY"
    if s in ("USD", "$"):
        return "USD"
    if s in ("EUR", "€"):
        return "EUR"
    return s


def _tutar_bul(metin: str) -> tuple[Optional[float], Optional[str]]:
    satirlar = metin.split("\n")
    for etiket_grubu, secim in TUTAR_ETIKET_ONCELIK:
        # "ücret hariç/üch" tam ifadesi kasıtlı olarak "ücret" içerdiği için
        # bu grupta genel haric-kelime filtresi uygulanmaz.
        haric_filtresi_aktif = secim != "son"

        for i, satir in enumerate(satirlar):
            alt = satir.lower()
            if haric_filtresi_aktif and any(k in alt for k in TUTAR_HARIC_KELIMELER):
                continue
            if not any(etiket in alt for etiket in etiket_grubu):
                continue

            eslesmeler = list(MIKTAR_DESENI.finditer(satir))
            if not eslesmeler:
                for j in range(i + 1, min(i + 1 + TUTAR_SATIR_ARAMA_DERINLIGI, len(satirlar))):
                    sonraki = satirlar[j]
                    if haric_filtresi_aktif and any(k in sonraki.lower() for k in TUTAR_HARIC_KELIMELER):
                        break
                    eslesmeler = list(MIKTAR_DESENI.finditer(sonraki))
                    if eslesmeler:
                        break

            if eslesmeler:
                m = eslesmeler[-1] if secim == "son" else eslesmeler[0]
                tutar = _sayi_cevir(m.group(1))
                if tutar is not None:
                    return tutar, _para_birimi_cevir(m.group(2))
    return None, None


def _tarih_bul(metin: str) -> Optional[str]:
    satirlar = metin.split("\n")
    etiketler = ["işlem tarihi", "valör tarihi", "tarih"]
    for etiket in etiketler:
        for i, satir in enumerate(satirlar):
            if etiket in satir.lower():
                for aday in (satir, satirlar[i + 1] if i + 1 < len(satirlar) else ""):
                    m = TARIH_DESENI.search(aday)
                    if m:
                        cevrilen = _tarih_cevir(m)
                        if cevrilen:
                            return cevrilen

    m = TARIH_DESENI.search(metin)
    return _tarih_cevir(m) if m else None


def _tarih_cevir(m: re.Match) -> Optional[str]:
    gun, ay, yil = m.groups()
    if len(yil) == 2:
        yil = "20" + yil
    try:
        return datetime(int(yil), int(ay), int(gun)).strftime("%Y-%m-%d")
    except ValueError:
        return None


def _iban_bul(metin: str) -> Optional[str]:
    satirlar = metin.split("\n")
    for i, satir in enumerate(satirlar):
        if "iban" in satir.lower():
            for aday in (satir, satirlar[i + 1] if i + 1 < len(satirlar) else ""):
                m = IBAN_DESENI.search(aday)
                if m:
                    return m.group(0).replace(" ", "")

    m = IBAN_DESENI.search(metin)
    return m.group(0).replace(" ", "") if m else None


def _isim_bul(metin: str, etiketler: list[str]) -> Optional[str]:
    satirlar = metin.split("\n")
    for etiket in etiketler:
        for i, satir in enumerate(satirlar):
            alt = satir.lower()
            konum = alt.find(etiket)
            if konum == -1:
                continue

            sonrasi = satir[konum + len(etiket) :].strip(" :-\t")
            if sonrasi:
                return sonrasi.strip()
            if i + 1 < len(satirlar):
                aday = satirlar[i + 1].strip()
                if aday:
                    return aday
    return None


def _iki_taraf_isim_bul(metin: str) -> tuple[Optional[str], Optional[str]]:
    """"Adı Soyadı/Unvan" gibi jenerik bir etiket, gönderici ve alıcı
    bölümlerinde ayrı ayrı ama aynı metinle iki kez geçtiğinde (bölüm
    başlığı ayrı satırda/sütunda kaldığından hangisi hangisi anlaşılamaz),
    sırayla ilk geçen gönderen, ikinci geçen alıcı kabul edilir. Etiket iki
    değeriyle birlikte aynı satıra da düşmüş olabilir (satır bazlı PDF
    okumasında sütunlar yan yana birleşebiliyor).
    """
    for etiket in GENEL_ISIM_ETIKETLERI:
        konumlar = [m.start() for m in re.finditer(re.escape(etiket), metin, re.IGNORECASE)]
        if len(konumlar) < 2:
            continue

        degerler: list[str] = []
        for i, baslangic in enumerate(konumlar):
            bitis = konumlar[i + 1] if i + 1 < len(konumlar) else len(metin)
            parca = metin[baslangic:bitis]
            # Etiket satırın kendisinde mi (aynı satır) yoksa bir sonraki
            # satırda mı bittiği fark etmeksizin ilk ":" işaretinden sonraki
            # ilk satırı değer kabul eder.
            deger = parca.split(":", 1)[1] if ":" in parca else ""
            deger = deger.strip().split("\n")[0].strip(" :-\t")
            if deger:
                degerler.append(deger)

        if len(degerler) >= 2:
            return degerler[0], degerler[1]
    return None, None


def _banka_bul(metin: str) -> Optional[str]:
    alt = metin.lower()
    for banka in BILINEN_BANKALAR:
        if banka.lower() in alt:
            return banka
    return None
