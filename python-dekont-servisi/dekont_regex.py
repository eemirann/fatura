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

# Python'un str.lower()'ı Türkçe için yanlıştır ve etiket eşleşmesini sessizce
# bozar: "İ".lower() -> "i̇" (i + ayrı birleşen nokta), "I".lower() -> "i"
# (Türkçe'de "ı" olmalıydı). Sonuç: BÜYÜK HARFLE basılmış bir dekontta
# "İŞLEM TUTARI" etiketi "işlem tutarı" ile EŞLEŞMİYORDU — bankalarda büyük
# harf yaygın olduğu için tutar sık sık daha genel "toplam" etiketine düşüyordu.
#
# Çözüm, Türkçe'ye özgü harfleri ASCII karşılıklarına katlamak. Yan faydası:
# Türkçe karakter kullanmayan (ALICI BILGILERI) ya da OCR'da şapkasını
# kaybetmiş metinler de eşleşir hâle geliyor.
_TR_KATLAMA = str.maketrans(
    {
        "İ": "i", "I": "i", "ı": "i",
        "Ş": "s", "ş": "s",
        "Ğ": "g", "ğ": "g",
        "Ü": "u", "ü": "u",
        "Ö": "o", "ö": "o",
        "Ç": "c", "ç": "c",
    }
)
# Not: Katlama harf-harf birebirdir (hiçbir karakter silinmez). _isim_bul,
# katlanmış metinde bulduğu konumla ORİJİNAL satırı kestiği için bu şart —
# uzunluğu değiştiren bir eşleme indeksleri kaydırırdı.


def _kucult(metin: str) -> str:
    """Etiket karşılaştırması için Türkçe-duyarlı küçültme (bkz. _TR_KATLAMA)."""
    return metin.translate(_TR_KATLAMA).lower()


MIN_METIN_UZUNLUGU = 20  # bunun altı "muhtemelen taranmış PDF" sayılır
BOZUK_KARAKTER_ORANI = 0.02  # bunun üstü "font kodlaması bozuk" sayılır (OCR'a düşülür)

# Ham metin, okuma başarısız olduğunda deseni düzeltebilmek için saklanır
# (bkz. sema.ham_metin). Tek sayfalık bir dekont birkaç bin karakter; sınır
# çok sayfalı/bozuk OCR çıktısının veritabanını şişirmesini engelliyor.
HAM_METIN_AZAMI = 10_000

_PARA_SEMBOLU = r"TL|TRY|₺|USD|\$|EUR|€|GBP|£"
# Para birimi sayının SOLUNDA da olabilir ("USD 1.650,00"). Önceki sürüm
# yalnızca sağa bakıyordu; bulamayınca TRY varsayıldığı için 1650 USD'lik bir
# dekont 1650 TL'lik faturayla eşleşip "ödendi" üretebiliyordu.
# Sıra önemli: en spesifik biçim önce denenir. Ayraçların anlamını
# _sayi_cevir çözer (Türkçe 1.650,00 ile İngilizce 1,650.00 aynı desene uyar).
MIKTAR_DESENI = re.compile(
    rf"(?:(?P<onek>{_PARA_SEMBOLU})\s*)?"
    r"(?P<sayi>"
    # (?!\d) şart: onsuz "9.876.543" -> "9.876.54" + "3" diye bölünüyordu
    # (son ".54" ondalık sanılıyor, kalan "3" ayrı bir tutar oluyordu).
    r"\d{1,3}(?:[.,]\d{3})+[.,]\d{2}(?!\d)"  # 1.650,00 / 1,650.00
    r"|\d+[.,]\d{2}(?!\d)"                 # 650,00 / 1650.50
    r"|\d{1,3}(?:[.,]\d{3})+(?![\d.,])"    # 1.650 / 1,650
    r"|\d+"                                # 1650
    r")"
    rf"\s*(?P<sonek>{_PARA_SEMBOLU})?",
    re.IGNORECASE,
)

# Sayının yanında hiç sembol yoksa metnin tamamında aranacak yazılı biçimler.
YAZILI_PARA_BIRIMLERI = [
    ("USD", ["abd doları", "amerikan doları", "dolar"]),
    ("EUR", ["euro", "avro"]),
    ("GBP", ["sterlin", "ingiliz sterlini"]),
]


def _metin_para_birimi(metin: str) -> Optional[str]:
    """Tutarın yanında birim yoksa metinde ayrıca belirtilmiş mi diye bakar.

    Bazı dekontlarda birim ayrı bir alanda duruyor ("Para Birimi : USD") ya da
    yazıyla geçiyor ("100,00 ABD Doları"). Bulunamazsa None döner; TRY varsayımı
    çağıran tarafta, yalnızca yabancı para işareti hiç yokken yapılır.
    """
    alt = _kucult(metin)
    for kod, yazimlar in YAZILI_PARA_BIRIMLERI:
        if any(_kucult(y) in alt for y in yazimlar):
            return kod
        if re.search(rf"\b{kod.lower()}\b", alt):
            return kod
    return None
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

# Bankanın işleme verdiği tekil numara. Öncelik sırası önemli: birden çok
# numara türü aynı dekontta geçebilir ("Referans Numarası" hem "Sorgu
# Numarası" hem de "e-Dekont Belge No" birlikte bulunabilir) — en standart ve
# en kalıcı olan (Referans No/İşlem No) önce denenir, aksi hâlde ilk bulunan
# (yalnızca ETTN gibi ilgisiz alanları toplayan) numara kazanabilir.
REFERANS_ETIKETLERI = [
    "referans numarası", "referans no",
    "işlem no", "islem no",
    "dekont no",
    "e-dekont belge no", "belge no",
    "fiş no", "fis no",
    "sorgu numarası", "sorgu no",
]
# Rakam/harf karışık, ayraçlı (/, ., -) tekil numaralar için: en az 5 karakter
# (kısa sayılar yanlış pozitif riski taşır), en çok 40.
REFERANS_DEGER_DESENI = re.compile(r"[A-Za-z0-9][A-Za-z0-9/.\-]{4,39}")


def _referans_no_bul(metin: str) -> Optional[str]:
    """Bankanın işlem/referans numarasını bulur — aynı dekontun farklı bir
    fatura için tekrar yüklenmesini yakalamanın en güvenilir yolu (bkz.
    app/api/ingest/route.ts'teki tekrar-kullanım kontrolü).

    Emin olunamadığında None döner: yanlış bir numara, olmayan bir tekrar-
    kullanımı "tespit edip" gerçek bir ödemeyi reddettirebilir — bu, hiç
    kontrol etmemekten daha kötü bir hata.
    """
    satirlar = metin.split("\n")
    for etiket in REFERANS_ETIKETLERI:
        for i, satir in enumerate(satirlar):
            alt = _kucult(satir)
            konum = alt.find(_kucult(etiket))
            if konum == -1:
                continue

            sonrasi = satir[konum + len(etiket) :].strip(" :-\t")
            m = REFERANS_DEGER_DESENI.search(sonrasi)
            if m:
                return m.group(0)

            if i + 1 < len(satirlar):
                aday = satirlar[i + 1].strip(" :-\t")
                m = REFERANS_DEGER_DESENI.search(aday)
                if m:
                    return m.group(0)
    return None


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
# Belgenin gerçekten bir para transferi dekontu olduğuna dair kanıtlar.
# Biri bile yoksa okuma reddedilir: aksi hâlde "Toplam: 1.650,00 TL" yazan
# HERHANGİ bir belge geçerli ödeme sayılıyordu.
# "gönder" kökü bilerek: gönderen / gönderici / gönderilen / gönderilecek
# hepsini kapsar. Fatura mesajındaki "gönderebilirsiniz" de eşleşir ama o
# zaten DEKONT_DEGIL_ISARETLERI ile önceden elenir.
DEKONT_KANITLARI = [
    "dekont", "havale", "eft", "fast", "makbuz", "para aktarma", "virman",
    "transfer", "gönder", "alıcı", "lehtar", "lehdar", "amir",
    "alacaklı", "borçlu", "işlem tarihi", "valör", "referans",
]

# Dekont OLMADIĞINI gösteren ifadeler. Bunlar kanıtlardan ÖNCE bakılır ve
# tek başına reddetmeye yeter.
#
# Kritik olan "son ödeme tarihi": ev sahibinin kiracıya gönderdiği fatura
# mesajı (bkz. settings.mesaj_sablonu) hem IBAN hem "dekont" kelimesi hem de
# "Toplam:" satırı içeriyor. Kiracı bu mesajın EKRAN GÖRÜNTÜSÜNÜ geri
# gönderirse tüm kanıt testlerini geçer ve fatura ödenmiş işaretlenirdi.
# Bankalar dekontlarında "son ödeme tarihi" yazmaz — ayırt edici olan bu.
DEKONT_DEGIL_ISARETLERI = [
    "son ödeme tarihi", "fatura bilgileri", "ödemenizin ardından",
    "sipariş", "irsaliye", "adisyon", "teklif formu", "proforma",
]


def _dekont_kaniti_var_mi(metin: str) -> bool:
    alt = _kucult(metin)
    if any(_kucult(i) in alt for i in DEKONT_DEGIL_ISARETLERI):
        return False
    if any(_kucult(k) in alt for k in DEKONT_KANITLARI):
        return True
    # Banka adı da tek başına yeterli bir sinyal.
    return _banka_bul(metin) is not None


def dekont_ayristir(metin: str) -> DekontSemasi:
    tutar, birim = _tutar_bul(metin)
    ham_metin = metin[:HAM_METIN_AZAMI] or None

    if not _dekont_kaniti_var_mi(metin):
        return DekontSemasi(
            okunabilir=False,
            tutar=None,
            para_birimi=None,
            tarih=None,
            alici_iban=None,
            alici_ad=None,
            gonderen_ad=None,
            banka=None,
            aciklama=(
                "Bu dosya bir para transferi dekontuna benzemiyor. "
                "Dekontu açıp elle kontrol edin."
            ),
            ham_metin=ham_metin,
        )

    # tutar <= 0: "0,00 TL" okunduğunda geçerli ödeme sayılıyordu. Toplamı 0
    # olan bir taslak faturaya denk gelirse fark 0 çıkıp "ödendi" üretirdi.
    if tutar is not None and tutar <= 0:
        return DekontSemasi(
            okunabilir=False,
            tutar=None,
            para_birimi=None,
            tarih=None,
            alici_iban=None,
            alici_ad=None,
            gonderen_ad=None,
            banka=None,
            aciklama="Okunan tutar sıfır ya da geçersiz. Dekontu açıp elle kontrol edin.",
            ham_metin=ham_metin,
        )

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

    # TRY varsayımı en sona: önce tutarın yanındaki sembol, sonra metinde
    # ayrıca belirtilmiş bir yabancı para birimi aranır. Aksi hâlde birimi
    # okunamayan bir USD dekontu TL sanılıp faturayla eşleşiyordu.
    para_birimi = birim or _metin_para_birimi(metin) or "TRY"
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
        referans_no=_referans_no_bul(metin),
        aciklama=f"{tutar:.2f} {para_birimi} tutarında işlem tespit edildi (regex/OCR).",
        ham_metin=ham_metin,
    )


def _sayi_cevir(ham: str) -> Optional[float]:
    """Ayraçların anlamını biçimden çözerek sayıya çevirir.

    Önceki sürüm noktayı koşulsuz binlik ayracı sayıyordu; "1650.50" 1650'ye
    yuvarlanıp kuruş sessizce siliniyordu. 1 kuruşluk TOLERANS ile birleşince
    bu, yanlış bir "tam eşleşti" üretebiliyordu.

    Kural: iki ayraç da varsa EN SAĞDAKİ ondalıktır (1.650,00 -> TR,
    1,650.00 -> EN). Tek ayraç varsa ardındaki hane sayısı belirler:
    üç hane binlik (1.650), iki hane ondalık (1650.50).
    """
    t = ham.strip()

    if "," in t and "." in t:
        if t.rfind(",") > t.rfind("."):
            t = t.replace(".", "").replace(",", ".")
        else:
            t = t.replace(",", "")
    elif "," in t:
        t = t.replace(",", ".") if len(t.rsplit(",", 1)[1]) == 2 else t.replace(",", "")
    elif "." in t:
        if len(t.rsplit(".", 1)[1]) == 3:
            t = t.replace(".", "")

    try:
        return round(float(t), 2)
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


# Tarih ve saat, tutar deseniyle de eşleşen rakam grupları içerir:
# "02.09.2026 18:47" içinden sırasıyla 02, 09.202, 6, 18, 47 yakalanıyor ve
# ilki tutar sanılıyordu. Bu aralıklar tutar adayı sayılmaz.
TARIH_SAAT_DESENI = re.compile(r"\d{1,4}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}:\d{2}(?::\d{2})?")

# Ayraçsız ve para birimsiz uzun rakam dizileri tutar değil, referans/hesap/
# dekont numarasıdır. Kira tutarları bu büyüklüğe ulaşmaz.
AZAMI_AYRACSIZ_HANE = 6

# Sayıdan hemen önce gelirse o sayının tutar değil, bir NUMARA olduğunu
# gösteren etiketler. "Dekont No 9.876.543" gibi numaralar geçerli tutar
# biçiminde yazılabildiği için biçime bakarak ayırt etmek mümkün değil.
NUMARA_ETIKETI_DESENI = re.compile(
    r"(?:\bno\b|\bnu\b|numara|referans|belge|sicil|seri|dekont\s+no|hesap\s+no|kod)"
    r"[\s.:#/-]*$",
    re.IGNORECASE,
)
NUMARA_ETIKETI_BAKIS = 24  # sayıdan geriye kaç karakter incelenecek


def _tutar_adayi_mi(m: re.Match, satir: str, yasakli: list[tuple[int, int]]) -> bool:
    """Eşleşmenin gerçekten bir para tutarı olup olmadığı."""
    bas, son = m.span("sayi")
    if any(bas < bitis and son > baslangic for baslangic, bitis in yasakli):
        return False  # tarih/saat aralığının içinde

    oncesi = _kucult(satir[max(0, bas - NUMARA_ETIKETI_BAKIS) : bas])
    if NUMARA_ETIKETI_DESENI.search(oncesi):
        return False  # referans/dekont/hesap numarası

    sayi = m.group("sayi")
    if not any(c in sayi for c in ".,") and not (m.group("onek") or m.group("sonek")):
        if len(sayi) > AZAMI_AYRACSIZ_HANE:
            return False  # ayraçsız uzun dizi: numara
    return True


def _satirdaki_tutarlar(satir: str) -> list[re.Match]:
    """Satırdaki para tutarı adaylarını döner (tarih/saat ve numaralar elenmiş)."""
    yasakli = [m.span() for m in TARIH_SAAT_DESENI.finditer(satir)]
    return [m for m in MIKTAR_DESENI.finditer(satir) if _tutar_adayi_mi(m, satir, yasakli)]


def _tutar_bul(metin: str) -> tuple[Optional[float], Optional[str]]:
    satirlar = metin.split("\n")
    for etiket_grubu, secim in TUTAR_ETIKET_ONCELIK:
        # "ücret hariç/üch" tam ifadesi kasıtlı olarak "ücret" içerdiği için
        # bu grupta genel haric-kelime filtresi uygulanmaz.
        haric_filtresi_aktif = secim != "son"

        for i, satir in enumerate(satirlar):
            alt = _kucult(satir)
            if haric_filtresi_aktif and any(_kucult(k) in alt for k in TUTAR_HARIC_KELIMELER):
                continue
            if not any(_kucult(etiket) in alt for etiket in etiket_grubu):
                continue

            eslesmeler = _satirdaki_tutarlar(satir)
            if not eslesmeler:
                for j in range(i + 1, min(i + 1 + TUTAR_SATIR_ARAMA_DERINLIGI, len(satirlar))):
                    sonraki = satirlar[j]
                    if haric_filtresi_aktif and any(
                        _kucult(k) in _kucult(sonraki) for k in TUTAR_HARIC_KELIMELER
                    ):
                        break
                    eslesmeler = _satirdaki_tutarlar(sonraki)
                    if eslesmeler:
                        break

            if eslesmeler:
                m = eslesmeler[-1] if secim == "son" else eslesmeler[0]
                tutar = _sayi_cevir(m.group("sayi"))
                if tutar is not None:
                    # Sağdaki sembol önceliklidir; yoksa soldaki kullanılır.
                    return tutar, _para_birimi_cevir(m.group("sonek") or m.group("onek"))
    return None, None


def _tarih_bul(metin: str) -> Optional[str]:
    satirlar = metin.split("\n")
    etiketler = ["işlem tarihi", "valör tarihi", "tarih"]
    for etiket in etiketler:
        for i, satir in enumerate(satirlar):
            if _kucult(etiket) in _kucult(satir):
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


ALICI_TARAF_ETIKETLERI = ["alıcı", "alacaklı", "lehtar", "lehdar", "karşı taraf"]
GONDEREN_TARAF_ETIKETLERI = [
    "gönderici", "gönderen", "borçlu", "amir", "ücret", "masraf", "komisyon"
]
IBAN_SATIR_ARAMA_DERINLIGI = 4


def _iban_bul(metin: str) -> Optional[str]:
    """Paranın GİTTİĞİ (alıcı) IBAN'ı bulur.

    Emin olunamadığında bilerek None döner. Önceki sürüm, "iban" geçen ilk
    satırda bulamazsa metindeki ilk IBAN'a düşüyordu; dekontlarda bu genelde
    GÖNDERENİN IBAN'ıdır. Gerçek bir İş Bankası dekontunda "Ücret Tah. IBAN"
    satırını yakalayıp gönderenin IBAN'ını alıcı diye kaydetti. Sonuç: her
    doğru dekontta "alıcı IBAN'ı farklı" uyarısı çıkıyor, uyarı körlüğü
    yaratıyor ve gerçekten başka hesaba giden ödeme fark edilmiyordu.
    """
    satirlar = metin.split("\n")

    # 1) Alıcı etiketinden çapalayarak ara — en güvenilir yol.
    for i, satir in enumerate(satirlar):
        alt = _kucult(satir)
        if not any(_kucult(e) in alt for e in ALICI_TARAF_ETIKETLERI):
            continue
        if any(_kucult(e) in alt for e in GONDEREN_TARAF_ETIKETLERI):
            continue  # "Gönderici/Alıcı" gibi tek satırda ikisi birden
        for j in range(i, min(i + 1 + IBAN_SATIR_ARAMA_DERINLIGI, len(satirlar))):
            m = IBAN_DESENI.search(satirlar[j])
            if m:
                return m.group(0).replace(" ", "")

    # 2) "IBAN" etiketli satırlar — gönderen/ücret bağlamındakiler hariç.
    for i, satir in enumerate(satirlar):
        alt = _kucult(satir)
        if "iban" not in alt:
            continue
        if any(_kucult(e) in alt for e in GONDEREN_TARAF_ETIKETLERI):
            continue
        for aday in (satir, satirlar[i + 1] if i + 1 < len(satirlar) else ""):
            m = IBAN_DESENI.search(aday)
            if m:
                return m.group(0).replace(" ", "")

    # 3) Metinde tek bir IBAN varsa belirsizlik yok, onu al.
    hepsi = {m.group(0).replace(" ", "") for m in IBAN_DESENI.finditer(metin)}
    return hepsi.pop() if len(hepsi) == 1 else None


# Etiketi takip eden ama DEĞER olmayan sözcükler. "Gönderici Hesap",
# "ALICI BILGILERI", "Alıcı Adı Soyadı" gibi başlıklarda etiketten sonra kişi
# adı değil, başlığın devamı gelir. Bunlar ayıklanmazsa gönderen adı olarak
# "Hesap" ya da "BILGILERI" kaydediliyordu (gerçek dekontlarda görüldü).
ETIKET_DEVAM_SOZCUKLERI = {
    "bilgileri", "bilgiler", "bilgisi",
    "hesap", "hesabi", "hesabina", "no", "numarasi",
    "adi", "ad", "soyadi", "soyad", "unvan", "unvani",
    "iban", "sube", "banka", "turu", "tipi",
}


def _deger_mi(aday: str) -> bool:
    """Etiketten artakalan parça gerçek bir değer mi, yoksa başlığın devamı mı."""
    temiz = aday.strip(" :-\t/").strip()
    if not temiz:
        return False
    parcalar = [p.strip(":/-") for p in _kucult(temiz).split()]
    parcalar = [p for p in parcalar if p]
    if not parcalar:
        return False
    # Tamamı başlık sözcüklerinden oluşuyorsa değer değildir.
    return not all(p in ETIKET_DEVAM_SOZCUKLERI for p in parcalar)


def _isim_bul(metin: str, etiketler: list[str]) -> Optional[str]:
    satirlar = metin.split("\n")
    for etiket in etiketler:
        for i, satir in enumerate(satirlar):
            alt = _kucult(satir)
            konum = alt.find(_kucult(etiket))
            if konum == -1:
                continue

            # Katlama birebir olduğu için konum orijinal satırda da geçerli.
            sonrasi = satir[konum + len(etiket) :]
            if _deger_mi(sonrasi):
                return sonrasi.strip(" :-\t").strip()

            # Değer ayrı satıra düşmüş olabilir. Bu durumda değer satırı ":" ile
            # başlar — hem İş Bankası ("Gönderici Hesap" / ": ABDULLAH ...") hem
            # Akbank ("Adi Soyadi/Unvan" / ": AYSE ERBAS") böyle. ":" şartı
            # olmadan bir sonraki BAŞLIK satırı değer sanılıyordu
            # ("GONDERICI BILGILERI" -> "ALICI BILGILERI").
            for j in range(i + 1, min(i + 1 + ISIM_SATIR_ARAMA_DERINLIGI, len(satirlar))):
                aday = satirlar[j].strip()
                if not aday.startswith(":"):
                    break
                if _deger_mi(aday):
                    return aday.strip(" :-\t").strip()
    return None


ISIM_SATIR_ARAMA_DERINLIGI = 2


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
    alt = _kucult(metin)
    for banka in BILINEN_BANKALAR:
        if _kucult(banka) in alt:
            return banka
    return None
