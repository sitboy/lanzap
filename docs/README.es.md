<div align="center">

# Zap

**Mismo Wi‑Fi, abre y envía.**

Un AirDrop que no necesitas instalar — un asistente de transferencia sin inicio de sesión.
Los dispositivos en la misma red abren una URL y llegan al mismo chat; el texto y los archivos
van **de igual a igual (P2P) y nunca pasan por el servidor**.

[**Live demo →**](https://file.joestudy.net)

<sub>
<a href="../README.md">English</a> ·
<a href="README.zh-CN.md">简体中文</a> ·
<a href="README.zh-TW.md">繁體中文</a> ·
Español ·
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
<a href="README.pl.md">Polski</a> ·
<a href="README.hi.md">हिन्दी</a>
</sub>

</div>

---

## Funciones

- 🚀 **Sin app, sin inicio de sesión, sin agregar contactos** — solo abre la URL en un navegador
- 🔒 **Los archivos nunca pasan por el servidor** — P2P directo, sin límite de tamaño, sin recompresión; el servidor no guarda datos ni registros
- 📁 **Carpetas enteras, con su estructura** — arrástrala o selecciónala; en Chromium de escritorio se reconstruye como una carpeta real en disco, en los demás navegadores llega un ZIP
- 👥 **Chats grupales y privados** — una sala "Todos" más un hilo privado con cada dispositivo
- 📷 **Tres formas de vincular** — descubrimiento automático en la misma red / escaneo de código QR en la página / código de sala de 5 caracteres / enlace para compartir
- 🌍 **18 idiomas**, cambia al instante; 🌗 el **modo oscuro** sigue al sistema
- 📝 **El historial vive solo en tu navegador** (IndexedDB) — invisible para otros dispositivos
- 🪶 **Sin framework, sin compilación** — el servidor solo necesita `ws`; el frontend es JS puro

## Autoalojamiento

Requiere Node ≥ 18.

```bash
git clone https://github.com/sitboy/lanzap.git zap && cd zap
npm install
node server.js          # listens on :8879 by default, override with PORT
```

Ejecútalo detrás de un proxy inverso. Tres requisitos obligatorios:

- **HTTPS es obligatorio** (los navegadores lo exigen para WebRTC / la cámara)
- El proxy debe admitir **la actualización (upgrade) de WebSocket**
- El proxy debe reenviar **`X-Real-IP`** (se usa para agrupar dispositivos en la misma red)

Ejemplo de Nginx:

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
    # listen 443 ssl; + certificado (certbot lo emite con un solo comando)
}
```

## Alcance

Conexión directa pura por LAN (sin STUN/TURN de ningún tipo), así que las transferencias funcionan **solo dentro de la misma red**. Abrir el enlace desde redes distintas igual coloca a todos en la misma sala y pueden verse entre sí, pero no pueden conectarse directamente — la interfaz lo indica claramente tras ~10 s en lugar de quedarse girando indefinidamente.

Todas las navegadores pueden **recibir** carpetas, pero **enviarlas** requiere un selector de carpetas: Safari de iOS no lo tiene, así que allí esa entrada está oculta. El límite es de 2000 archivos por carpeta; si lo superas se te avisa para que la comprimas tú, en lugar de descartar una parte en silencio.

## Cómo funciona

La señalización está en `server.js` (`ws`; agrupa los dispositivos por IP de salida / prefijo IPv6‑64, un código de sala manual anula esto) más el frontend en `public/` (malla WebRTC, fragmentación de 64 KB con contrapresión; el escaneo de QR prefiere `BarcodeDetector` y recurre a jsQR). El sistema de diseño vive en `design/`.

La carpeta **no** se empaqueta antes de enviarse: viaja como un lote de archivos normales, cada uno con su ruta relativa a la raíz, de modo que el progreso por archivo, el control de flujo y la reconexión siguen funcionando igual. Solo el último paso —escribir en disco— se bifurca según la plataforma: File System Access escribe el árbol directamente (en streaming, sin retener nada en memoria) y el resto se recoge en un ZIP sin comprimir mediante `public/zip.js` (~130 líneas, sin dependencias). Las rutas entrantes se tratan como entrada hostil y se sanean, así que nada puede salirse del directorio de destino; si el disco va más lento que la red, el receptor frena al emisor en vez de acumular el atasco en RAM.

## Licencia

[MIT](../LICENSE)
