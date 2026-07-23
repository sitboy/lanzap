<div align="center">

# Zap

**Aynı Wi‑Fi'de aç ve gönder.**

Kurulum gerektirmeyen bir AirDrop — girişsiz bir aktarım yardımcısı.
Aynı ağdaki cihazlar tek bir URL açar ve aynı sohbete düşer; metin ve dosyalar
**eşler arası (P2P) gider ve sunucuya asla dokunmaz**.

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
Türkçe ·
<a href="README.pl.md">Polski</a> ·
<a href="README.hi.md">हिन्दी</a>
</sub>

</div>

---

## Özellikler

- 🚀 **Uygulama yok, giriş yok, kişi eklemek yok** — tarayıcıda URL'yi açman yeterli
- 🔒 **Dosyalar sunucuya asla dokunmaz** — doğrudan P2P, boyut sınırı yok, yeniden sıkıştırma yok; sunucu sıfır veri ve sıfır log tutar
- 📁 **Klasörün tamamı, yapısı bozulmadan** — sürükleyin ya da seçin; masaüstü Chromium’da doğrudan gerçek bir klasör ağacı olarak diske yazılır, diğer tarayıcılara ZIP olarak ulaşır
- 👥 **Grup + özel sohbetler** — bir "Herkes" odası artı her cihazla özel bir sohbet
- 📷 **Üç eşleşme yöntemi** — aynı ağda otomatik keşif / sayfa içi QR tarama / 5 karakterlik oda kodu / paylaşılabilir bağlantı
- 🌍 **18 dil**, yerinde değiştirilebilir; 🌗 **karanlık mod** sistemi takip eder
- 📝 **Geçmiş yalnızca tarayıcında yaşar** (IndexedDB) — diğer cihazlardan görünmez
- 🪶 **Sıfır framework, sıfır build** — sunucunun ihtiyacı tek şey `ws`; ön yüz saf vanilla JS

## Kendi sunucunda barındırma

Node ≥ 18 gerektirir.

```bash
git clone https://github.com/sitboy/lanzap.git zap && cd zap
npm install
node server.js          # varsayılan olarak :8879 portunu dinler, PORT ile değiştirilebilir
```

Bir ters proxy'nin arkasında çalıştır. Üç kesin gereklilik var:

- **HTTPS zorunludur** (tarayıcılar WebRTC / kamera için bunu gerektirir)
- Proxy **WebSocket upgrade**'i desteklemelidir
- Proxy **`X-Real-IP`**'yi iletmelidir (aynı ağdaki cihazları gruplamak için kullanılır)

Nginx örneği:

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
    # listen 443 ssl; + sertifika (certbot tek komutla verir)
}
```

## Kapsam

Saf LAN doğrudan bağlantısı (hiçbir türde STUN/TURN yok), bu yüzden aktarımlar **yalnızca aynı ağ içinde** çalışır. Bağlantıyı farklı ağlar arasında açmak yine herkesi aynı odaya koyar ve birbirlerini görebilirler, ama doğrudan bağlanamazlar — arayüz bunu sonsuza dek döndürmek yerine ~10 saniye sonra açıkça belirtir.

Klasör **almayı** her tarayıcı yapabilir, ama **göndermek** için bir klasör seçici gerekir: iOS Safari’de yok, bu yüzden orada bu giriş gizlenir. Klasör başına sınır 2000 dosyadır; aşarsanız bir kısmı sessizce düşürülmek yerine kendiniz sıkıştırmanız açıkça söylenir.

## Nasıl çalışır

`server.js` içindeki sinyalleşme (`ws`; cihazları çıkış IP'sine / IPv6‑64 önekine göre gruplar, manuel bir oda kodu bunu geçersiz kılar) artı `public/` içindeki ön yüz (WebRTC mesh, geri basınç kontrollü 64 KB parçalama; QR tarama önce `BarcodeDetector`'ı dener, olmazsa jsQR'a döner). Tasarım sistemi `design/` içinde yaşar.

Klasör gönderilmeden önce **paketlenmez**: sıradan dosyalardan oluşan bir küme olarak yol alır, her dosya kökene göre kendi yolunu taşır; böylece dosya bazlı ilerleme, geri basınç ve yeniden bağlanma aynen çalışmayı sürdürür. Yalnızca son adım — diske yazma — platforma göre ayrılır: File System Access ağacı doğrudan yazar (akış hâlinde, bellekte hiçbir şey tutulmaz), geri kalan her yerde `public/zip.js` (~130 satır, bağımlılıksız) sıkıştırmasız bir ZIP’e toplar. Gelen yollar düşmanca girdi sayılıp temizlenir, dolayısıyla hedef dizinin dışına hiçbir şey taşamaz; disk ağdan yavaşsa alıcı, birikmeyi RAM’de yığmak yerine göndereni yavaşlatır.

## Lisans

[MIT](../LICENSE)
