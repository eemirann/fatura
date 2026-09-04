import os

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from pydantic import BaseModel

from dekont_oku import dekont_oku, mime_desteklenir_mi

app = FastAPI(title="Dekont Okuma Servisi", version="1.0.0")

AZAMI_BOYUT = 10 * 1024 * 1024  # 10 MB — storage bucket limitiyle aynı


class DekontYanit(BaseModel):
    okunabilir: bool
    tutar: float | None
    para_birimi: str | None
    tarih: str | None
    alici_iban: str | None
    alici_ad: str | None
    gonderen_ad: str | None
    banka: str | None
    aciklama: str


def anahtari_dogrula(x_service_key: str | None = Header(default=None)) -> None:
    beklenen = os.environ.get("DEKONT_SERVICE_KEY")
    if not beklenen:
        return
    if x_service_key != beklenen:
        raise HTTPException(status_code=401, detail="Geçersiz servis anahtarı.")


@app.get("/health")
async def saglik() -> dict[str, str]:
    return {"durum": "ok"}


@app.post("/dekont-oku", response_model=DekontYanit)
async def dekont_okuma(
    file: UploadFile = File(...),
    _: None = Depends(anahtari_dogrula),
) -> DekontYanit:
    mime = file.content_type or "application/octet-stream"
    if not mime_desteklenir_mi(mime):
        raise HTTPException(
            status_code=400,
            detail=(
                "iPhone HEIC formatı okunamıyor. Lütfen ekran görüntüsü olarak (PNG/JPG) "
                "veya PDF gönderin."
                if mime in ("image/heic", "image/heif")
                else "Yalnızca PDF, JPG, PNG ve WebP dosyaları kabul edilir."
            ),
        )

    icerik = await file.read()
    if len(icerik) == 0:
        raise HTTPException(status_code=400, detail="Dosya boş.")
    if len(icerik) > AZAMI_BOYUT:
        raise HTTPException(status_code=400, detail="Dosya 10 MB sınırını aşıyor.")

    try:
        okuma = await dekont_oku(icerik, mime)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Okuma başarısız: {e}") from e

    return DekontYanit(**okuma.model_dump())
