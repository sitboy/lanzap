# lan-transfer 局域网传输助手

同一 WiFi 下的设备打开同一个网址,自动进入同一个"群":聊天流界面(微信传输助手式),
文字/文件全部走 WebRTC 点对点直传——**文件永远不经过服务器**,服务器只做发现与握手牵线。

- 免装 App,浏览器即用;不限文件大小,图片不压缩
- 按出口 IP 自动分房;设备改名;中/英双语(语言包外置 `public/i18n.js`)
- 历史记录仅存本机浏览器(IndexedDB);服务器零存储零日志
- 纯局域网 ICE(host candidates),不依赖外部 STUN/TURN

## 运行
node server.js   # PORT 环境变量可改,默认 8879;生产用 nginx 反代并配 wss + HTTPS(WebRTC 必需)
