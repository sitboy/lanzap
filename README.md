<div align="center">

# Zap · 近传

**Same Wi‑Fi, open & send.**

An AirDrop you don't install — a transfer helper without the login.
Devices on the same network open one URL and land in the same chat; text and files
go **peer‑to‑peer and never touch the server**.

[**Live demo →**](https://file.joestudy.net)

<sub>
English ·
<a href="docs/README.zh-CN.md">简体中文</a> ·
<a href="docs/README.zh-TW.md">繁體中文</a> ·
<a href="docs/README.es.md">Español</a> ·
<a href="docs/README.pt.md">Português</a> ·
<a href="docs/README.fr.md">Français</a> ·
<a href="docs/README.de.md">Deutsch</a> ·
<a href="docs/README.it.md">Italiano</a> ·
<a href="docs/README.nl.md">Nederlands</a> ·
<a href="docs/README.ru.md">Русский</a> ·
<a href="docs/README.ja.md">日本語</a> ·
<a href="docs/README.ko.md">한국어</a> ·
<a href="docs/README.id.md">Indonesia</a> ·
<a href="docs/README.vi.md">Tiếng Việt</a> ·
<a href="docs/README.th.md">ไทย</a> ·
<a href="docs/README.tr.md">Türkçe</a> ·
<a href="docs/README.pl.md">Polski</a> ·
<a href="docs/README.hi.md">हिन्दी</a>
</sub>

</div>

---

## Features

- 🚀 **No app, no login, no adding contacts** — just open the URL in a browser
- 🔒 **Files never touch the server** — direct P2P, no size limit, no re‑compression; the server keeps zero data and zero logs
- 👥 **Group + private chats** — one “Everyone” room plus a private thread with each device
- 📷 **Three ways to pair** — automatic same‑network discovery / in‑page QR scan / 5‑char room code / shareable link
- 🌍 **18 languages**, switched in place; 🌗 **dark mode** follows the system
- 📝 **History lives only in your browser** (IndexedDB) — invisible from other devices
- 🪶 **Zero framework, zero build** — the server needs only `ws`; the front end is plain vanilla JS

## Self‑hosting

Requires Node ≥ 18.

```bash
git clone https://github.com/sitboy/lanzap.git zap && cd zap
npm install
node server.js          # listens on :8879 by default, override with PORT
```

Run it behind a reverse proxy. Three hard requirements:

- **HTTPS is mandatory** (browsers require it for WebRTC / camera)
- The proxy must support **WebSocket upgrade**
- The proxy must pass **`X-Real-IP`** (used to group devices on the same network)

Nginx example:

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
    # listen 443 ssl; + certificate (certbot issues one in a single command)
}
```

## Scope

Pure LAN direct connection (no STUN/TURN of any kind), so transfers work **only within the
same network**. Opening the link across networks still puts everyone in the same room and they
can see each other, but they cannot connect directly — the UI says so clearly after ~10 s
instead of spinning forever.

## How it works

Signaling in `server.js` (`ws`; groups devices by egress IP / IPv6‑64 prefix, a manual room
code overrides this) plus the front end in `public/` (WebRTC mesh, 64 KB chunking with
back‑pressure; QR scanning prefers `BarcodeDetector` and falls back to jsQR). The design
system lives in `design/`.

## License

[MIT](LICENSE)
