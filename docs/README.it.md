<div align="center">

# Zap

**Stesso Wi‑Fi, apri e invia.**

Un AirDrop che non devi installare — un assistente di trasferimento senza login.
I dispositivi sulla stessa rete aprono un unico URL e finiscono nella stessa chat; testo e file
viaggiano **da peer a peer e non toccano mai il server**.

[**Demo live →**](https://file.joestudy.net)

<sub>
<a href="../README.md">English</a> ·
<a href="README.zh-CN.md">简体中文</a> ·
<a href="README.zh-TW.md">繁體中文</a> ·
<a href="README.es.md">Español</a> ·
<a href="README.pt.md">Português</a> ·
<a href="README.fr.md">Français</a> ·
<a href="README.de.md">Deutsch</a> ·
Italiano ·
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

## Funzionalità

- 🚀 **Nessuna app, nessun login, nessun contatto da aggiungere** — basta aprire l'URL in un browser
- 🔒 **I file non toccano mai il server** — P2P diretto, nessun limite di dimensione, nessuna ricompressione; il server non conserva né dati né log
- 📁 **Cartelle intere, struttura inclusa** — trascinala o selezionala; su Chromium desktop viene riscritta su disco come cartella vera, gli altri browser ricevono uno ZIP
- 👥 **Chat di gruppo e private** — una stanza "Everyone" più un thread privato con ogni dispositivo
- 📷 **Tre modi per accoppiarsi** — rilevamento automatico sulla stessa rete / scansione QR in pagina / codice stanza a 5 caratteri / link condivisibile
- 🌍 **18 lingue**, cambiabili al volo; 🌗 **modalità scura** che segue il sistema
- 📝 **La cronologia vive solo nel tuo browser** (IndexedDB) — invisibile dagli altri dispositivi
- 🪶 **Zero framework, zero build** — il server richiede solo `ws`; il front end è JavaScript vanilla puro

## Self‑hosting

Richiede Node ≥ 18.

```bash
git clone https://github.com/sitboy/lanzap.git zap && cd zap
npm install
node server.js          # ascolta sulla porta :8879 di default, sovrascrivibile con PORT
```

Eseguilo dietro un reverse proxy. Tre requisiti obbligatori:

- **HTTPS è obbligatorio** (i browser lo richiedono per WebRTC / fotocamera)
- Il proxy deve supportare l'**upgrade WebSocket**
- Il proxy deve inoltrare **`X-Real-IP`** (usato per raggruppare i dispositivi sulla stessa rete)

Esempio Nginx:

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
    # listen 443 ssl; + certificato (certbot lo emette con un solo comando)
}
```

## Ambito

Connessione diretta puramente LAN (nessun STUN/TURN di alcun tipo), quindi i trasferimenti funzionano
**solo all'interno della stessa rete**. Aprire il link tra reti diverse mette comunque tutti nella
stessa stanza e possono vedersi a vicenda, ma non possono connettersi direttamente — l'interfaccia
lo comunica chiaramente dopo circa 10 s invece di girare all'infinito.

**Ricevere** una cartella funziona su tutti i browser, ma per **inviarla** serve un selettore di cartelle: Safari su iOS non ce l’ha, quindi lì la voce è nascosta. Il limite è di 2000 file per cartella; oltre quella soglia ti viene chiesto di comprimerla tu, invece di perderne un pezzo in silenzio.

## Come funziona

Il signaling è in `server.js` (`ws`; raggruppa i dispositivi per IP di uscita / prefisso IPv6‑64,
un codice stanza manuale ha la precedenza) più il front end in `public/` (mesh WebRTC, chunking a
64 KB con back‑pressure; la scansione QR preferisce `BarcodeDetector` e ripiega su jsQR). Il design
system vive in `design/`.

La cartella **non** viene impacchettata prima dell’invio: viaggia come un lotto di file normali, ognuno con il proprio percorso relativo alla radice, così avanzamento per file, back-pressure e riconnessione continuano a funzionare identici. Solo l’ultimo passo — la scrittura su disco — si dirama per piattaforma: File System Access scrive l’albero direttamente (in streaming, senza trattenere nulla in memoria), tutto il resto finisce in uno ZIP non compresso creato da `public/zip.js` (~130 righe, zero dipendenze). I percorsi in arrivo sono trattati come input ostile e ripuliti, quindi nulla può uscire dalla cartella di destinazione; se il disco è più lento della rete, chi riceve rallenta chi invia anziché accumulare l’arretrato in RAM.

## Licenza

[MIT](../LICENSE)
