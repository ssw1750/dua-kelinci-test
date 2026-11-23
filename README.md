# Dua Kelinci — Sales Intelligence & Telegram Digest

Aplikasi web ringan untuk menganalisis data penjualan Dua Kelinci (September–Oktober 2026) tanpa memerlukan database lokal. Data dimuat ke memori saat startup dengan pembersihan otomatis, pre-aggregasi cepat, dan ringkasan Telegram yang dipersonalisasi per Sales Manager maupun per Regional PIC.

## Fitur Utama
- **Penjualan per Region, Brand, & Matriks Brand × Region:** Mendukung filter periode (**YTD Sep–Okt 2026**, **September 2026**, **Oktober 2026**) serta filter per **Region** dan **Cabang (Branch)**.
- **Penandaan Outlet Terlemah (3 Level):**
  1. **5 Outlet Terlemah Nasional**
  2. **5 Outlet Terlemah per Region**
  3. **Outlet Terlemah per Branch (13 Cabang)**
- **Ringkasan & Pengiriman Telegram Terpersonalisasi:**
  - Pesan 1 paragraf ringkas yang menyesuaikan cakupan pembaca (**Sales Manager Nasional** atau **Regional PIC** masing-masing wilayah).
  - Tombol **Salin Pesan**, **Kirim ke PIC Terpilih**, dan **Blast Semua Regional PIC (6 Region)** (masing-masing menerima metrik wilayah dan cabangnya sendiri).
  - Berjalan langsung dalam **Demo / Dry-Run Mode** tanpa kredensial; opsional mendukung pengiriman nyata via **Telegram Bot API** (`Pengaturan Telegram` atau environment variable `TELEGRAM_BOT_TOKEN`).
- **Audit Kualitas Data Transparan:**
  - Normalisasi 10 variasi penulisan `region` (`Jabar`, `JAWA BARAT`, `JABODETABEK`, `JAWA TIMUR`).
  - Deduplikasi aman (*exact full-row match* pada 15 kolom) menghapus 3 baris duplikat identik (`INV500201`, `INV500386`, `INV500791`) tanpa menghapus transaksi multi-SKU atau repeat order sah.
  - Perapian spasi `outlet_name`, penandaan `salesman` kosong menjadi `"Unknown"`, serta pelabelan nota retur `RTR900001` (-2 karton / -Rp 528.000) yang tetap diperhitungkan di Net Sales.

## Cara Menjalankan di Komputer Lokal

```bash
git clone https://github.com/ssw1750/dua-kelinci-test.git
cd dua-kelinci-test
chmod +x run.sh
./run.sh
```

Atau manual:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Buka **http://127.0.0.1:8000** di browser.

## Menjalankan Pengujian

```bash
.venv/bin/pytest -v
```
