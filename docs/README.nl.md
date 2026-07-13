<div align="center">

# Zap

**Zelfde wifi, open & verstuur.**

Een AirDrop die je niet hoeft te installeren — een overdrachtshulpje zonder inloggen.
Apparaten op hetzelfde netwerk openen één URL en komen in dezelfde chat terecht; tekst en
bestanden gaan **peer‑to‑peer en raken de server nooit aan**.

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
Nederlands ·
<a href="README.ru.md">Русский</a> ·
<a href="README.ja.md">日本語</a> ·
<a href="README.ko.md">한국어</a> ·
<a href="README.id.md">Indonesia</a> ·
<a href="README.vi.md">Tiếng Việt</a> ·
<a href="README.th.md">ไทย</a> ·
<a href="README.tr.md">Türkçe</a> ·
<a href="README.pl.md">Polski</a> ·
<a href="README.hi.md">हिन्दी</a>
</sub>

</div>

---

## Functies

- 🚀 **Geen app, geen login, geen contacten toevoegen** — open gewoon de URL in een browser
- 🔒 **Bestanden raken de server nooit aan** — directe P2P, geen groottelimiet, geen hercompressie; de server bewaart geen data en geen logs
- 👥 **Groeps- en privéchats** — één "Everyone"-ruimte plus een privégesprek met elk apparaat
- 📷 **Drie manieren om te koppelen** — automatische detectie op hetzelfde netwerk / QR-scan in de pagina / 5-tekens kamercode / deelbare link
- 🌍 **18 talen**, direct om te schakelen; 🌗 **donkere modus** volgt het systeem
- 📝 **Geschiedenis leeft alleen in je browser** (IndexedDB) — onzichtbaar voor andere apparaten
- 🪶 **Geen framework, geen build** — de server heeft alleen `ws` nodig; de front end is pure vanilla JS

## Zelf hosten

Vereist Node ≥ 18.

```bash
git clone https://github.com/sitboy/lanzap.git zap && cd zap
npm install
node server.js          # luistert standaard op :8879, override met PORT
```

Draai het achter een reverse proxy. Drie harde vereisten:

- **HTTPS is verplicht** (browsers vereisen dit voor WebRTC / camera)
- De proxy moet **WebSocket upgrade** ondersteunen
- De proxy moet **`X-Real-IP`** doorgeven (gebruikt om apparaten op hetzelfde netwerk te groeperen)

Nginx-voorbeeld:

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
    # listen 443 ssl; + certificaat (certbot geeft er met één commando een uit)
}
```

## Reikwijdte

Pure LAN-directverbinding (geen STUN/TURN van welke aard dan ook), dus overdrachten werken
**alleen binnen hetzelfde netwerk**. Als je de link tussen netwerken opent, komt iedereen nog
steeds in dezelfde ruimte en kunnen ze elkaar zien, maar ze kunnen niet direct verbinden — de UI
meldt dit duidelijk na ~10 s in plaats van eindeloos te blijven laden.

## Hoe het werkt

Signalering in `server.js` (`ws`; groepeert apparaten op uitgaand IP / IPv6‑64-prefix, een
handmatige kamercode overschrijft dit) plus de front end in `public/` (WebRTC-mesh, 64 KB
chunking met back-pressure; QR-scannen geeft de voorkeur aan `BarcodeDetector` en valt terug op
jsQR). Het designsysteem staat in `design/`.

## Licentie

[MIT](../LICENSE)
