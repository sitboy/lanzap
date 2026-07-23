<div align="center">

# Zap

**Wi-Fi yang sama, buka & kirim.**

AirDrop tanpa perlu instal — alat bantu transfer tanpa perlu login.
Perangkat di jaringan yang sama cukup membuka satu URL dan langsung masuk ke obrolan yang sama;
teks dan file dikirim **secara peer-to-peer dan tidak pernah menyentuh server**.

[**Live demo →**](https://file.joestudy.net)

<sub>
<a href="../README.md">English</a> ·
<a href="README.zh-CN.md">简体中文</a> ·
<a href="README.zh-TW.md">繁體中文</a> ·
<a href="README.es.md">Español</a> ·
<a href="README.pt.md">Português</a> ·
<a href="README.fr.md">Français</a> ·
<a href="README.de.md">Deutsch</a> ·
<a href="README.it.md">Italiano</a> ·
<a href="README.nl.md">Nederlands</a> ·
<a href="README.ru.md">Русский</a> ·
<a href="README.ja.md">日本語</a> ·
<a href="README.ko.md">한국어</a> ·
Indonesia ·
<a href="README.vi.md">Tiếng Việt</a> ·
<a href="README.th.md">ไทย</a> ·
<a href="README.tr.md">Türkçe</a> ·
<a href="README.pl.md">Polski</a> ·
<a href="README.hi.md">हिन्दी</a>
</sub>

</div>

---

## Fitur

- 🚀 **Tanpa aplikasi, tanpa login, tanpa perlu menambah kontak** — cukup buka URL di browser
- 🔒 **File tidak pernah menyentuh server** — P2P langsung, tanpa batas ukuran, tanpa kompresi ulang; server tidak menyimpan data maupun log sama sekali
- 📁 **Satu folder utuh, strukturnya tetap** — seret atau pilih saja; di Chromium desktop folder itu ditulis kembali ke disk sebagai folder sungguhan, peramban lain menerima ZIP
- 👥 **Obrolan grup + pribadi** — satu ruang "Semua Orang" ditambah thread pribadi dengan setiap perangkat
- 📷 **Beberapa cara untuk menghubungkan** — deteksi otomatis jaringan yang sama / pindai QR di halaman / kode ruang 5 karakter / tautan yang bisa dibagikan
- 🌍 **18 bahasa**, bisa diganti langsung; 🌗 **mode gelap** mengikuti pengaturan sistem
- 📝 **Riwayat hanya tersimpan di browser Anda** (IndexedDB) — tidak terlihat dari perangkat lain
- 🪶 **Tanpa framework, tanpa proses build** — server hanya membutuhkan `ws`; front end-nya JS murni (vanilla)

## Hosting Sendiri

Membutuhkan Node ≥ 18.

```bash
git clone https://github.com/sitboy/lanzap.git zap && cd zap
npm install
node server.js          # listens on :8879 by default, override with PORT
```

Jalankan di belakang reverse proxy. Tiga syarat wajib:

- **HTTPS wajib** (browser mensyaratkannya untuk WebRTC / kamera)
- Proxy harus mendukung **WebSocket upgrade**
- Proxy harus meneruskan **`X-Real-IP`** (digunakan untuk mengelompokkan perangkat di jaringan yang sama)

Contoh konfigurasi Nginx:

```nginx
server {
    server_name your-domain.example;
    location / {
        proxy_pass http://127.0.0.1:8879;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
    }
    # listen 443 ssl; + sertifikat (certbot bisa menerbitkannya dengan satu perintah)
}
```

## Cakupan

Koneksi langsung LAN murni (tanpa STUN/TURN dalam bentuk apa pun), sehingga transfer hanya berfungsi
**dalam jaringan yang sama**. Membuka tautan lintas jaringan tetap akan menempatkan semua orang di
ruang yang sama dan mereka bisa saling melihat, tetapi tidak bisa terhubung langsung — UI akan
menampilkan pesan yang jelas setelah ~10 detik alih-alih berputar tanpa henti.

Semua peramban bisa **menerima** folder, tetapi **mengirim** butuh pemilih folder: Safari iOS tidak punya, jadi pintu masuknya disembunyikan di sana. Batasnya 2000 berkas per folder — kalau lebih, kamu diberi tahu untuk mengompresnya sendiri, bukan sebagian dibuang diam-diam.

## Cara Kerja

Signaling ada di `server.js` (menggunakan `ws`; mengelompokkan perangkat berdasarkan IP keluar /
prefix IPv6-64, kode ruang manual akan menimpa aturan ini) ditambah front end di `public/` (mesh
WebRTC, chunking 64 KB dengan back-pressure; pemindaian QR mengutamakan `BarcodeDetector` dan
beralih ke jsQR bila tidak tersedia). Sistem desain ada di `design/`.

Folder **tidak** dibungkus dulu sebelum dikirim: ia berjalan sebagai sekumpulan berkas biasa, masing-masing membawa jalurnya relatif terhadap akar folder, sehingga progres per berkas, back-pressure, dan penyambungan ulang tetap bekerja apa adanya. Hanya langkah terakhir — menulis ke disk — yang bercabang per platform: File System Access menulis pohonnya langsung (streaming, tidak ada yang ditahan di memori), sisanya dilipat menjadi ZIP tanpa kompresi oleh `public/zip.js` (~130 baris, tanpa dependensi). Jalur yang masuk diperlakukan sebagai masukan berbahaya dan dibersihkan, jadi tidak ada yang bisa keluar dari folder tujuan; kalau disk lebih lambat dari jaringan, penerima merem pengirim alih-alih menumpuk antrean di RAM.

## Lisensi

[MIT](../LICENSE)
