# Desafío Scraping Arcano

Automatiza el sitio de manuscritos sagrados: login, descarga de PDFs,
OCR, resolución de API binaria y obtención de contraseña final.

## Requisitos del sistema

Windows
-Node.js 18+
-Chocolatey instalado: https://chocolatey.org/install

Luego ejecutar como Administrador:
-choco install poppler
-choco install tesseract

Linux
-sudo apt update
-sudo apt install poppler-utils tesseract-ocr

MacOS
-brew install poppler tesseract


## Uso

```bash
npm install
npm start