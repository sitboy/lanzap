<div align="center">

# 近传 · Zap

**同一 WiFi，打开即传。** — Same Wi‑Fi, open & send.

不装 App 的隔空传，不用微信的传输助手。
An AirDrop you don't install, a transfer helper without the login.

[**在线体验 / Live demo →**](https://file.joestudy.net)

</div>

---

同一网络下的设备，打开同一个网址就**自动出现在同一个会话里**——像用文件传输助手一样互发文字和文件。文字与文件全部走 **WebRTC 点对点直传**，**永远不经过服务器**；服务器只做"介绍人"，牵线后即退场。

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
git clone <this-repo> zap && cd zap
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

[MIT](LICENSE)
