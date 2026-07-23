<div align="center">

# Zap

**Cùng Wi-Fi, mở là gửi.**

Một AirDrop không cần cài đặt — công cụ chuyển file không cần đăng nhập.
Các thiết bị trong cùng mạng chỉ cần mở một URL là vào chung một cuộc trò chuyện; văn bản và
file được truyền **trực tiếp peer-to-peer và không bao giờ đi qua server**.

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
Tiếng Việt ·
<a href="README.th.md">ไทย</a> ·
<a href="README.tr.md">Türkçe</a> ·
<a href="README.pl.md">Polski</a> ·
<a href="README.hi.md">हिन्दी</a>
</sub>

</div>

---

## Tính năng

- 🚀 **Không cần cài app, không cần đăng nhập, không cần thêm liên hệ** — chỉ cần mở URL trong trình duyệt
- 🔒 **File không bao giờ đi qua server** — P2P trực tiếp, không giới hạn dung lượng, không nén lại; server không lưu bất kỳ dữ liệu hay log nào
- 📁 **Cả thư mục, giữ nguyên cấu trúc** — kéo vào hoặc chọn; trên Chromium máy tính, thư mục được ghi thẳng lại xuống đĩa đúng như cây thư mục gốc, các trình duyệt khác nhận một tệp ZIP
- 👥 **Trò chuyện nhóm + riêng tư** — một phòng "Mọi người" cùng một luồng riêng với từng thiết bị
- 📷 **Ba cách để kết nối** — tự động phát hiện cùng mạng / quét QR ngay trên trang / mã phòng 5 ký tự / liên kết chia sẻ
- 🌍 **18 ngôn ngữ**, chuyển đổi ngay tại chỗ; 🌗 **chế độ tối** theo hệ thống
- 📝 **Lịch sử chỉ lưu trong trình duyệt của bạn** (IndexedDB) — không hiển thị trên thiết bị khác
- 🪶 **Không framework, không cần build** — server chỉ cần `ws`; front end là JS thuần (vanilla)

## Tự triển khai (Self-hosting)

Yêu cầu Node ≥ 18.

```bash
git clone https://github.com/sitboy/lanzap.git zap && cd zap
npm install
node server.js          # listens on :8879 by default, override with PORT
```

Chạy sau một reverse proxy. Ba yêu cầu bắt buộc:

- **Bắt buộc dùng HTTPS** (trình duyệt yêu cầu để dùng WebRTC / camera)
- Proxy phải hỗ trợ **nâng cấp WebSocket (WebSocket upgrade)**
- Proxy phải chuyển tiếp **`X-Real-IP`** (dùng để nhóm các thiết bị trong cùng mạng)

Ví dụ cấu hình Nginx:

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
    # listen 443 ssl; + chứng chỉ (certbot có thể cấp chỉ bằng một lệnh)
}
```

## Phạm vi

Kết nối trực tiếp LAN thuần túy (không dùng bất kỳ STUN/TURN nào), nên việc truyền file chỉ hoạt
động **trong cùng một mạng**. Nếu mở liên kết từ mạng khác, mọi người vẫn vào chung một phòng và
có thể thấy nhau, nhưng không thể kết nối trực tiếp — giao diện sẽ thông báo rõ điều này sau
khoảng 10 giây thay vì quay vòng vô tận.

Mọi trình duyệt đều **nhận** được thư mục, nhưng **gửi** thì cần hộp thoại chọn thư mục: Safari trên iOS không có nên lối vào đó được ẩn đi. Mỗi thư mục tối đa 2000 tệp — vượt quá, bạn sẽ được nhắc tự nén lại thay vì bị âm thầm bỏ bớt một phần.

## Cách hoạt động

Tín hiệu (signaling) nằm trong `server.js` (dùng `ws`; nhóm thiết bị theo IP đi ra / tiền tố
IPv6-64, mã phòng thủ công sẽ ghi đè quy tắc này), cùng với front end trong `public/` (mesh
WebRTC, chia khối 64 KB có back-pressure; quét QR ưu tiên dùng `BarcodeDetector` và chuyển sang
jsQR nếu không hỗ trợ). Hệ thống thiết kế nằm trong `design/`.

Thư mục **không** bị đóng gói trước khi gửi: nó đi như một lô tệp thông thường, mỗi tệp mang đường dẫn tương đối so với thư mục gốc, nhờ vậy tiến độ từng tệp, cơ chế chống nghẽn và tự kết nối lại vẫn hoạt động y như cũ. Chỉ bước cuối — ghi xuống đĩa — mới rẽ nhánh theo nền tảng: File System Access ghi thẳng cây thư mục (theo luồng, không giữ gì trong bộ nhớ), còn lại được `public/zip.js` (~130 dòng, không phụ thuộc) gộp thành một ZIP không nén. Đường dẫn nhận về luôn bị coi là dữ liệu độc hại và được làm sạch, nên không gì thoát ra ngoài thư mục đích; khi đĩa chậm hơn mạng, bên nhận sẽ ghì bên gửi lại thay vì chất đống tồn đọng trong RAM.

## Giấy phép

[MIT](../LICENSE)
