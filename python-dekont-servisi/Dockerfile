# Dekont okuma servisi (FastAPI + Tesseract OCR).
#
# Neden Docker: servis yalnızca `pip install` ile çalışmaz — pytesseract
# sistemde kurulu bir `tesseract` ikilisi arar ve dekontlar Türkçe olduğu için
# `tur` dil paketi de gerekir (bkz. dekont_regex.py, lang="tur"). İmaj bu ikisini
# de içinde taşır, böylece VPS'te elle kurulum yapmaya gerek kalmaz.
#
# PDF tarafı PyMuPDF ile çözülüyor; poppler gibi ek bir sistem bağımlılığı yok.

FROM python:3.12-slim

# tesseract-ocr: OCR motoru · tesseract-ocr-tur: Türkçe dil paketi
# (--no-install-recommends + apt listelerinin silinmesi imajı küçük tutar)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-tur \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Önce sadece requirements: kod değiştiğinde pip katmanı yeniden kurulmasın.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py dekont_oku.py dekont_regex.py dekont_gorsel.py dekont_gemini.py sema.py ./

# Root olarak çalıştırmıyoruz — servis internete açık bir portta duracak.
RUN useradd --create-home --shell /usr/sbin/nologin dekont \
    && chown -R dekont:dekont /app
USER dekont

EXPOSE 8000

# slim imajda curl yok; sağlık kontrolünü Python'un kendisiyle yapıyoruz.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status==200 else 1)"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
