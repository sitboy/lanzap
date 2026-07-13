<div align="center">

# Zap

**Ta sama sieć Wi‑Fi, otwórz i wyślij.**

AirDrop, którego nie trzeba instalować — pomocnik do przesyłania plików bez logowania.
Urządzenia w tej samej sieci otwierają jeden adres URL i trafiają do tego samego czatu; tekst i pliki
płyną **bezpośrednio między urządzeniami (peer‑to‑peer) i nigdy nie dotykają serwera**.

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
<a href="README.id.md">Indonesia</a> ·
<a href="README.vi.md">Tiếng Việt</a> ·
<a href="README.th.md">ไทย</a> ·
<a href="README.tr.md">Türkçe</a> ·
Polski ·
<a href="README.hi.md">हिन्दी</a>
</sub>

</div>

---

## Funkcje

- 🚀 **Bez aplikacji, bez logowania, bez dodawania kontaktów** — wystarczy otworzyć URL w przeglądarce
- 🔒 **Pliki nigdy nie dotykają serwera** — bezpośrednie P2P, brak limitu rozmiaru, bez ponownej kompresji; serwer nie przechowuje żadnych danych ani logów
- 👥 **Czaty grupowe i prywatne** — jeden pokój „Wszyscy" plus prywatny wątek z każdym urządzeniem
- 📷 **Trzy sposoby parowania** — automatyczne wykrywanie w tej samej sieci / skanowanie QR na stronie / 5‑znakowy kod pokoju / link do udostępnienia
- 🌍 **18 języków**, przełączanych na miejscu; 🌗 **tryb ciemny** podąża za systemem
- 📝 **Historia żyje tylko w Twojej przeglądarce** (IndexedDB) — niewidoczna dla innych urządzeń
- 🪶 **Zero frameworków, zero builda** — serwer potrzebuje tylko `ws`; front‑end to czysty vanilla JS

## Hosting we własnym zakresie

Wymaga Node ≥ 18.

```bash
git clone https://github.com/sitboy/lanzap.git zap && cd zap
npm install
node server.js          # domyślnie nasłuchuje na :8879, można nadpisać przez PORT
```

Uruchom za reverse proxy. Trzy twarde wymagania:

- **HTTPS jest obowiązkowe** (przeglądarki wymagają go dla WebRTC / kamery)
- Proxy musi obsługiwać **WebSocket upgrade**
- Proxy musi przekazywać **`X-Real-IP`** (używane do grupowania urządzeń w tej samej sieci)

Przykład dla Nginx:

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
    # listen 443 ssl; + certyfikat (certbot wystawia go jedną komendą)
}
```

## Zakres

Czyste bezpośrednie połączenie w sieci lokalnej (bez jakiegokolwiek STUN/TURN), więc przesyłanie działa **tylko w obrębie tej samej sieci**. Otwarcie linku między różnymi sieciami nadal umieszcza wszystkich w tym samym pokoju i widzą się nawzajem, ale nie mogą połączyć się bezpośrednio — interfejs mówi o tym wyraźnie po ~10 s, zamiast kręcić się w nieskończoność.

## Jak to działa

Sygnalizacja w `server.js` (`ws`; grupuje urządzenia po adresie IP wyjścia / prefiksie IPv6‑64, ręczny kod pokoju to nadpisuje) plus front‑end w `public/` (mesh WebRTC, fragmentacja 64 KB z kontrolą przeciwciśnienia; skanowanie QR preferuje `BarcodeDetector`, a w razie potrzeby wraca do jsQR). System projektowy znajduje się w `design/`.

## Licencja

[MIT](../LICENSE)
