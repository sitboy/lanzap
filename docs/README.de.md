<div align="center">

# Zap

**Gleiches WLAN, öffnen & senden.**

Ein AirDrop, das man nicht installieren muss — ein Übertragungshelfer ohne Login.
Geräte im selben Netzwerk öffnen eine URL und landen im selben Chat; Text und Dateien
werden **peer‑to‑peer übertragen und berühren nie den Server**.

[**Live demo →**](https://file.joestudy.net)

<sub>
<a href="../README.md">English</a> ·
<a href="README.zh-CN.md">简体中文</a> ·
<a href="README.zh-TW.md">繁體中文</a> ·
<a href="README.es.md">Español</a> ·
<a href="README.pt.md">Português</a> ·
<a href="README.fr.md">Français</a> ·
Deutsch ·
<a href="README.it.md">Italiano</a> ·
<a href="README.nl.md">Nederlands</a> ·
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

## Funktionen

- 🚀 **Keine App, kein Login, keine Kontakte hinzufügen** — einfach die URL im Browser öffnen
- 🔒 **Dateien berühren nie den Server** — direktes P2P, keine Größenbeschränkung, keine Neukomprimierung; der Server speichert weder Daten noch Logs
- 📁 **Ganze Ordner, Struktur bleibt erhalten** — hineinziehen oder auswählen; auf Chromium am Desktop landet der Ordnerbaum direkt wieder auf der Festplatte, andere Browser bekommen ein ZIP
- 👥 **Gruppen- und Privatchats** — ein „Alle"-Raum plus ein privater Thread mit jedem Gerät
- 📷 **Drei Möglichkeiten zum Koppeln** — automatische Erkennung im selben Netzwerk / QR-Scan direkt auf der Seite / 5-stelliger Raumcode / teilbarer Link
- 🌍 **18 Sprachen**, sofort umschaltbar; 🌗 der **Dunkelmodus** folgt dem System
- 📝 **Der Verlauf existiert nur im eigenen Browser** (IndexedDB) — für andere Geräte unsichtbar
- 🪶 **Kein Framework, kein Build** — der Server braucht nur `ws`; das Frontend ist reines Vanilla-JS

## Selbst hosten

Erfordert Node ≥ 18.

```bash
git clone https://github.com/sitboy/lanzap.git zap && cd zap
npm install
node server.js          # listens on :8879 by default, override with PORT
```

Betreibe es hinter einem Reverse Proxy. Drei zwingende Voraussetzungen:

- **HTTPS ist zwingend erforderlich** (Browser verlangen es für WebRTC / die Kamera)
- Der Proxy muss **WebSocket-Upgrade** unterstützen
- Der Proxy muss **`X-Real-IP`** weiterreichen (wird genutzt, um Geräte im selben Netzwerk zu gruppieren)

Nginx-Beispiel:

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
    # listen 443 ssl; + Zertifikat (certbot stellt eines mit einem einzigen Befehl aus)
}
```

## Umfang

Reine LAN-Direktverbindung (kein STUN/TURN jeglicher Art), daher funktionieren Übertragungen **nur innerhalb desselben Netzwerks**. Öffnet man den Link aus unterschiedlichen Netzwerken, landen trotzdem alle im selben Raum und sehen sich gegenseitig, können sich aber nicht direkt verbinden — die Oberfläche weist nach ~10 s klar darauf hin, statt endlos zu laden.

**Empfangen** können Ordner alle Browser, zum **Senden** braucht es aber einen Ordner-Dialog: iOS-Safari hat keinen, dort ist der Einstieg deshalb ausgeblendet. Pro Ordner sind 2000 Dateien das Limit — darüber wirst du gebeten, ihn selbst zu packen, statt dass stillschweigend ein Teil wegfällt.

## Funktionsweise

Das Signaling steckt in `server.js` (`ws`; gruppiert Geräte nach ausgehender IP / IPv6‑64-Präfix, ein manueller Raumcode überschreibt das) plus das Frontend in `public/` (WebRTC-Mesh, 64‑KB-Chunking mit Backpressure; QR-Scan bevorzugt `BarcodeDetector` und fällt sonst auf jsQR zurück). Das Designsystem liegt in `design/`.

Ein Ordner wird vor dem Senden **nicht** verpackt: Er läuft als Stapel gewöhnlicher Dateien, jede mit ihrem Pfad relativ zur Ordnerwurzel — dadurch funktionieren Fortschritt pro Datei, Gegendruck und Reconnect unverändert weiter. Nur der letzte Schritt, das Schreiben auf die Platte, verzweigt sich je nach Plattform: File System Access schreibt den Baum direkt (streamend, nichts bleibt im Speicher), alles andere sammelt `public/zip.js` (~130 Zeilen, ohne Abhängigkeit) in einem unkomprimierten ZIP. Eingehende Pfade gelten als feindliche Eingabe und werden bereinigt, sodass nichts aus dem Zielordner ausbrechen kann; ist die Platte langsamer als das Netz, bremst der Empfänger den Sender aus, statt den Rückstau im RAM zu stapeln.

## Lizenz

[MIT](../LICENSE)
