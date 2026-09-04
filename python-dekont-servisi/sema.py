from typing import Optional

from pydantic import BaseModel, Field


class DekontSemasi(BaseModel):
    """Claude'un dekonttan çıkaracağı alanlar (lib/dekont-oku.ts ile aynı sözleşme)."""

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
    aciklama: str = Field(
        description=(
            "okunabilir=false ise nedenini tek cümleyle Türkçe yaz. "
            "okunabilir=true ise kısa bir özet yaz."
        ),
    )
