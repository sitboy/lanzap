# 近传 Zap

**同一 WiFi，打开即传。** 不装 App 的隔空传,不用微信的传输助手:同一网络的设备打开同一个网址
自动成群,文字与文件 P2P 直传——不经服务器、不限大小、不压画质。

- 聊天流界面(传输助手心智),历史只存本机浏览器(IndexedDB),服务器零存储
- 自动同房(出口 IP/IPv6 前缀分组) + 组队兜底(站内扫码 / 5 位房码 / 复制链接)
- 中英双语(语言包 `public/i18n.js`);暗色模式(prefers-color-scheme)
- 零框架零构建:服务端仅依赖 ws;前端 vanilla;扫码 jsQR 软解(无 GMS 设备可用)+BarcodeDetector 加速
- 设计:claude design 定稿(`design/近传Zap设计.html`,含 token/组件/双端/暗色全套)

## 运行
node server.js   # 默认 :8879;生产用 nginx 反代(须传 X-Real-IP,wss upgrade)+HTTPS(WebRTC 必需)

## 部署(现网)
https://file.joestudy.net —— tokyo PM2 `lan-transfer`
rsync -az --exclude node_modules ./ tokyo:/opt/apps/lan-transfer/ && ssh tokyo 'pm2 restart lan-transfer'
