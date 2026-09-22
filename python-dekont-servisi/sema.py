from typing import Optional

from pydantic import BaseModel, Field


class DekontSemasi(BaseModel):
    """Dekonttan çıkarılacak alanlar — hem regex/OCR (dekont_regex.py, birincil
    yol) hem opsiyonel Gemini fallback'i (dekont_gemini.py, regex okuyamazsa
    devreye girer) aynı sözleşmeye doldurur. lib/dekont-servis.ts ile aynı
    şema."""

    okunabilir: bool = Field(
        description="Bu dosya bir para transferi dekontu/makbuzu mu ve tutarı net okunabiliyor mu?",
    )
    tutar: Optional[float] = Field(
        default=None,
        description=(
            "Gönderilen ana tutar, sayı olarak (örn. 1650.50). İşlem ücreti, bakiye, "
            "limit gibi diğer tutarları ALMA. Okunamıyorsa null."
        ),
    )
    para_birimi: Optional[str] = Field(
        default=None, description="TRY, USD, EUR gibi. Bilinmiyorsa null."
    )
    tarih: Optional[str] = Field(
        default=None, description="İşlem tarihi, YYYY-MM-DD biçiminde. Yoksa null."
    )
    alici_iban: Optional[str] = Field(
        default=None, description="Paranın gittiği IBAN, boşluksuz. Yoksa null."
    )
    alici_ad: Optional[str] = Field(default=None, description="Alıcı/lehtar adı. Yoksa null.")
    gonderen_ad: Optional[str] = Field(
        default=None, description="Gönderen kişinin adı. Yoksa null."
    )
    banka: Optional[str] = Field(
        default=None, description="Dekontu düzenleyen banka. Yoksa null."
    )
    referans_no: Optional[str] = Field(
        default=None,
        description=(
            "Bankanın işleme verdiği tekil numara (Referans No, İşlem No, "
            "Dekont No, Fiş No, Sorgu No gibi etiketlerle geçer). Aynı dekontun "
            "tekrar kullanılıp kullanılmadığını denetlemek için. Emin olunamıyorsa null."
        ),
    )
    gorsel_hash: Optional[str] = Field(
        default=None,
        description=(
            "Dekont görselinin dHash imzası (64 bit, hex). Kırpılmış/yeniden "
            "sıkıştırılmış ama görsel olarak aynı dekontun tekrar kullanılmasını "
            "yakalamak için. Görsel işlenemediyse null."
        ),
    )
    aciklama: str = Field(
        description=(
            "okunabilir=false ise nedenini tek cümleyle Türkçe yaz. "
            "okunabilir=true ise kısa bir özet yaz."
        ),
    )
    ham_metin: Optional[str] = Field(
        default=None,
        description=(
            "Dosyadan çıkarılan düz metin (PDF metni ya da OCR çıktısı). "
            "Okuma başarısız olduğunda 'hangi metinde arandı' sorusunun tek "
            "cevabı bu; onsuz düzeltilecek deseni bulmak mümkün değil. "
            "Metin hiç çıkarılamadıysa null."
        ),
    )
