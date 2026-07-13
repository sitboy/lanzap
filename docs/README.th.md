<div align="center">

# Zap

**Wi-Fi เดียวกัน เปิดแล้วส่งได้เลย**

AirDrop ที่ไม่ต้องติดตั้ง — ตัวช่วยส่งไฟล์ที่ไม่ต้องล็อกอิน
อุปกรณ์ในเครือข่ายเดียวกันแค่เปิด URL เดียวกันก็จะเข้าห้องแชทเดียวกันทันที ข้อความและไฟล์จะถูกส่งแบบ
**peer-to-peer โดยตรงและไม่ผ่านเซิร์ฟเวอร์เลย**

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
ไทย ·
<a href="README.tr.md">Türkçe</a> ·
<a href="README.pl.md">Polski</a> ·
<a href="README.hi.md">हिन्दी</a>
</sub>

</div>

---

## จุดเด่น

- 🚀 **ไม่ต้องติดตั้งแอป ไม่ต้องล็อกอิน ไม่ต้องเพิ่มรายชื่อผู้ติดต่อ** — แค่เปิด URL ในเบราว์เซอร์
- 🔒 **ไฟล์ไม่ผ่านเซิร์ฟเวอร์เลย** — ส่งแบบ P2P โดยตรง ไม่จำกัดขนาด ไม่มีการบีบอัดซ้ำ เซิร์ฟเวอร์ไม่เก็บข้อมูลหรือ log ใด ๆ ทั้งสิ้น
- 👥 **แชทกลุ่ม + แชทส่วนตัว** — ห้อง "ทุกคน" หนึ่งห้อง บวกกับเธรดส่วนตัวกับแต่ละอุปกรณ์
- 📷 **เชื่อมต่อได้หลายวิธี** — ค้นหาอัตโนมัติในเครือข่ายเดียวกัน / สแกน QR ในหน้าเว็บ / รหัสห้อง 5 ตัวอักษร / ลิงก์แชร์
- 🌍 **รองรับ 18 ภาษา** สลับได้ทันที; 🌗 **โหมดมืด** ตามการตั้งค่าระบบ
- 📝 **ประวัติการแชทเก็บไว้ในเบราว์เซอร์ของคุณเท่านั้น** (IndexedDB) — อุปกรณ์อื่นมองไม่เห็น
- 🪶 **ไม่ใช้เฟรมเวิร์ก ไม่ต้องบิลด์** — เซิร์ฟเวอร์ต้องการแค่ `ws`; ฝั่งหน้าบ้านเป็น JavaScript ล้วน (vanilla)

## การโฮสต์เอง (Self-hosting)

ต้องใช้ Node ≥ 18

```bash
git clone https://github.com/sitboy/lanzap.git zap && cd zap
npm install
node server.js          # listens on :8879 by default, override with PORT
```

รันหลัง reverse proxy โดยมีข้อกำหนดที่จำเป็น 3 ข้อ:

- **ต้องใช้ HTTPS** (เบราว์เซอร์กำหนดให้ใช้สำหรับ WebRTC / กล้อง)
- proxy ต้องรองรับ **การอัปเกรดเป็น WebSocket (WebSocket upgrade)**
- proxy ต้องส่งต่อ **`X-Real-IP`** (ใช้เพื่อจัดกลุ่มอุปกรณ์ในเครือข่ายเดียวกัน)

ตัวอย่างการตั้งค่า Nginx:

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
    # listen 443 ssl; + ใบรับรอง (certbot ออกให้ได้ด้วยคำสั่งเดียว)
}
```

## ขอบเขตการใช้งาน

การเชื่อมต่อ LAN โดยตรงแบบล้วน ๆ (ไม่ใช้ STUN/TURN ใด ๆ ทั้งสิ้น) ดังนั้นการส่งไฟล์จะใช้งานได้
**เฉพาะภายในเครือข่ายเดียวกันเท่านั้น** การเปิดลิงก์ข้ามเครือข่ายยังคงทำให้ทุกคนเข้าห้องเดียวกันและ
มองเห็นกันได้ แต่จะเชื่อมต่อโดยตรงไม่ได้ — หน้าจอจะแจ้งเตือนอย่างชัดเจนหลังผ่านไปประมาณ 10 วินาที
แทนที่จะหมุนโหลดไปเรื่อย ๆ

## หลักการทำงาน

ระบบสัญญาณ (signaling) อยู่ใน `server.js` (ใช้ `ws`; จัดกลุ่มอุปกรณ์ตาม IP ขาออก / prefix IPv6-64
โดยรหัสห้องที่กรอกเองจะแทนที่กฎนี้) บวกกับฝั่งหน้าบ้านใน `public/` (WebRTC แบบ mesh, แบ่งข้อมูล
เป็นก้อนละ 64 KB พร้อม back-pressure; การสแกน QR จะใช้ `BarcodeDetector` ก่อน แล้วค่อย fallback
ไปที่ jsQR) ระบบดีไซน์อยู่ใน `design/`

## สัญญาอนุญาต

[MIT](../LICENSE)
