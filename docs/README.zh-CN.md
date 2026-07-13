<div align="center">

# Zap · 近传

**同一 WiFi，打开即传。**

不装 App 的隔空传，不用微信的传输助手。
同一网络下的设备打开同一个网址，就自动出现在同一个会话里；文字与文件
**点对点直传，永远不经过服务器**。

[**在线体验 →**](https://file.joestudy.net)

<sub>
<a href="../README.md">English</a> ·
简体中文 ·
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
<a href="README.pl.md">Polski</a> ·
<a href="README.hi.md">हिन्दी</a>
</sub>

</div>

---

## 特性

- 🚀 **免装 App、免登录、免加好友**：浏览器打开即用
- 🔒 **文件不碰服务器**：P2P 直传，不限大小、不压画质，服务器零存储零日志
- 👥 **群聊 + 私聊**：房间内一个「所有人」群聊 + 每台设备可单独私聊
- 📷 **组队三通道**：自动同网发现 / 站内扫码 / 5 位房码 / 复制链接
- 🌍 **18 种语言**，界面原地热切换；🌗 **暗色模式**跟随系统
- 📝 **历史只存本机浏览器**（IndexedDB），换设备互不可见
- 🪶 **零框架零构建**：服务端仅依赖 `ws`，前端纯 vanilla

## 自托管

需要 Node ≥ 18。

```bash
git clone https://github.com/sitboy/lanzap.git zap && cd zap
npm install
node server.js          # 默认监听 :8879，PORT 环境变量可改
```

生产部署放在反向代理后面，三条硬要求：

- **必须 HTTPS**（浏览器对 WebRTC / 摄像头的硬性要求）
- 反代支持 **WebSocket upgrade**
- 反代传 **`X-Real-IP`**（自动同网分房依据）

Nginx 示例：

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
    # listen 443 ssl; + 证书（certbot 一键签发）
}
```

## 边界

纯局域网直连（不依赖任何 STUN/TURN），因此**只在同一网络内互传**。跨网络打开会进入同一房间、能看见彼此，但无法直连——界面约 10 秒后明确提示，而非无限加载。

## 技术

信令 `server.js`（`ws`，按出口 IP / IPv6‑64 前缀自动分房，手动房码覆盖）+ 前端 `public/`（WebRTC mesh，64KB 分块 + 背压；扫码 BarcodeDetector 优先、jsQR 兜底）。设计系统见 `design/`。

## License

[MIT](../LICENSE)
