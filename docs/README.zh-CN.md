<div align="center">

# Zap · 近传

**同一 WiFi，打开即传。**

不装 App 的隔空传，不用微信的传输助手。
同一网络下的设备打开同一个网址，就自动出现在同一个会话里；文字与文件
**点对点直传，永远不经过服务器**。扫码组队还能让**不同网络**的设备互连，仅在直连实在打不通时才走中继——走了会在界面上明说。

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
- 🔒 **在自己的网络里，文件不碰服务器**：P2P 直传，不限大小、不压画质，服务器零存储零日志。自动发现的本网房**从不下发中继**，所以这条是代码结构保证的，不是口头承诺
- 🌐 **跨网络组队，中继只当兜底**：扫码 = 你明确表达"就要连这两台"，该房间才会额外拿到 TURN 中继。永远优先直连；只有直连打不通才走中继，且设备会被标注为**中继连接**。即便如此字节仍是端到端加密（DTLS）的——中继只转发，读不了内容
- 📁 **整个文件夹，目录结构不丢**：拖进来或点选即可；桌面版 Chromium 直接还原成真实文件夹，其他浏览器收到 ZIP
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

分两档，取决于两台设备是怎么找到对方的：

| 连接方式 | 下发的 ICE 服务器 | 字节走哪 |
| --- | --- | --- |
| 自动发现的本网房 | 只有 STUN | 永远设备到设备 |
| 显式组队（扫码 / 房码 / 链接） | STUN **+ TURN** | 能直连就直连；中继只作最后兜底，且如实标注 |

这样切分是刻意的：默认路径在代码上就不可能中继，所以"文件不经过服务器"是结构属性而非承诺。要用中继必须有一个明确动作——扫码——用上了界面就显示**中继连接**，不藏着。

自托管：不设 `TURN_HOST` 就完全不下发任何 ICE 服务器，行为与旧版纯局域网版本一模一样。设了 `TURN_HOST` + `TURN_SECRET`（与你 coturn 的 `static-auth-secret` 一致）才启用跨网这一档。

仍然连不上时，界面会在约 10 秒（有中继时 20 秒，因为中继握手更慢）后说出**具体原因**——组播被网络挡、AP 隔离、中继不可达——而不是无限加载或笼统甩一句"不同网络"。

文件夹**所有浏览器都能收**，但**发**需要系统的文件夹选择器：iOS Safari 没有，那里的入口已隐藏。单个文件夹上限 2000 个文件——超了会明确提示你先自行压缩，而不是悄悄少发一部分。

## 技术

信令 `server.js`（`ws`，按出口 IP / IPv6‑64 前缀自动分房，手动房码覆盖）+ 前端 `public/`（WebRTC mesh，64KB 分块 + 背压；扫码 BarcodeDetector 优先、jsQR 兜底）。设计系统见 `design/`。

文件夹**不会**先打包再发：它作为一批普通文件传输，每个文件带上相对根目录的路径，因此逐文件进度、背压、断线重连全部原样复用。只有落盘这最后一步按平台分叉：File System Access 直接把目录树写进磁盘（流式，内存不留数据），其余浏览器由 `public/zip.js`（约 130 行、零依赖）收进一个不压缩的 ZIP。收到的路径一律当敌意输入清洗，无法逃出目标目录；磁盘比网络慢时，接收端会限速发送端，而不是把积压堆在内存里。

## License

[MIT](../LICENSE)
