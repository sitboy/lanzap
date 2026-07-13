<div align="center">

# Zap

**Même Wi‑Fi, ouvrez et envoyez.**

Un AirDrop que vous n'avez pas besoin d'installer — un assistant de transfert sans connexion.
Les appareils sur le même réseau ouvrent une URL et se retrouvent dans le même salon ; le texte et les fichiers
transitent **en pair‑à‑pair et ne passent jamais par le serveur**.

[**Live demo →**](https://file.joestudy.net)

<sub>
<a href="../README.md">English</a> ·
<a href="README.zh-CN.md">简体中文</a> ·
<a href="README.zh-TW.md">繁體中文</a> ·
<a href="README.es.md">Español</a> ·
<a href="README.pt.md">Português</a> ·
Français ·
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
<a href="README.pl.md">Polski</a> ·
<a href="README.hi.md">हिन्दी</a>
</sub>

</div>

---

## Fonctionnalités

- 🚀 **Pas d'appli, pas de connexion, pas d'ajout de contacts** — il suffit d'ouvrir l'URL dans un navigateur
- 🔒 **Les fichiers ne passent jamais par le serveur** — P2P direct, aucune limite de taille, aucune recompression ; le serveur ne conserve ni données ni journaux
- 👥 **Discussions de groupe et privées** — un salon « Tout le monde » plus un fil privé avec chaque appareil
- 📷 **Trois façons de s'appairer** — découverte automatique sur le même réseau / scan de QR code dans la page / code de salon à 5 caractères / lien partageable
- 🌍 **18 langues**, changées à la volée ; 🌗 le **mode sombre** suit le système
- 📝 **L'historique reste uniquement dans votre navigateur** (IndexedDB) — invisible depuis les autres appareils
- 🪶 **Zéro framework, zéro build** — le serveur n'a besoin que de `ws` ; le front-end est du JS pur

## Auto-hébergement

Nécessite Node ≥ 18.

```bash
git clone https://github.com/sitboy/lanzap.git zap && cd zap
npm install
node server.js          # listens on :8879 by default, override with PORT
```

Faites-le tourner derrière un reverse proxy. Trois exigences strictes :

- **HTTPS est obligatoire** (les navigateurs l'exigent pour WebRTC / la caméra)
- Le proxy doit prendre en charge le **upgrade WebSocket**
- Le proxy doit transmettre **`X-Real-IP`** (utilisé pour regrouper les appareils du même réseau)

Exemple Nginx :

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
    # listen 443 ssl; + certificat (certbot en émet un en une seule commande)
}
```

## Périmètre

Connexion directe pure en LAN (aucun STUN/TURN, de quelque nature que ce soit), donc les transferts fonctionnent **uniquement au sein du même réseau**. Ouvrir le lien depuis des réseaux différents place quand même tout le monde dans le même salon et chacun peut voir les autres, mais ils ne peuvent pas se connecter directement — l'interface l'indique clairement après ~10 s au lieu de tourner indéfiniment.

## Fonctionnement

La signalisation se trouve dans `server.js` (`ws` ; regroupe les appareils par IP de sortie / préfixe IPv6‑64, un code de salon manuel prend le dessus) ainsi que le front-end dans `public/` (maillage WebRTC, découpage en blocs de 64 Ko avec contre-pression ; le scan de QR privilégie `BarcodeDetector` et se replie sur jsQR). Le système de design se trouve dans `design/`.

## Licence

[MIT](../LICENSE)
