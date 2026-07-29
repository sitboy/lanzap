<div align="center">

# Zap · 近傳

**同一 WiFi，打開即傳。**

不裝 App 的隔空傳，不用微信的傳輸助手。
同一網路下的裝置打開同一個網址，就自動出現在同一個對話裡；文字與檔案
**點對點直傳，永遠不經過伺服器**。掃碼組隊還能讓**不同網路**的裝置互連，僅在直連實在打不通時才走中繼——走了會在介面上明說。

[**線上體驗 →**](https://file.joestudy.net)

<sub>
<a href="../README.md">English</a> ·
<a href="README.zh-CN.md">简体中文</a> ·
繁體中文 ·
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

- 🚀 **免裝 App、免登入、免加好友**：瀏覽器打開即用
- 🔒 **在自己的網路裡，檔案不碰伺服器**：P2P 直傳，不限大小、不壓畫質，伺服器零儲存零日誌。自動探索的本網房**從不下發中繼**，所以這條是程式結構保證的，不是口頭承諾
- 🌐 **跨網路組隊，中繼只當兜底**：掃碼 = 你明確表達「就要連這兩台」，該房間才會額外拿到 TURN 中繼。永遠優先直連；只有直連打不通才走中繼，且裝置會被標註為**中繼連線**。即便如此位元組仍是端到端加密（DTLS）的——中繼只轉發，讀不了內容
- 📁 **整個資料夾，目錄結構不丟**：拖進來或點選即可；桌面版 Chromium 直接還原成真實資料夾，其他瀏覽器收到 ZIP
- 👥 **群聊 + 私聊**：房間內一個「所有人」群聊 + 每台裝置可單獨私聊
- 📷 **組隊三通道**：自動同網發現 / 站內掃碼 / 5 位房碼 / 複製連結
- 🌍 **18 種語言**，介面原地熱切換；🌗 **暗色模式**跟隨系統
- 📝 **紀錄只存本機瀏覽器**（IndexedDB），換裝置互不可見
- 🪶 **零框架零建置**：伺服端僅依賴 `ws`，前端純 vanilla

## 自架

需要 Node ≥ 18。

```bash
git clone https://github.com/sitboy/lanzap.git zap && cd zap
npm install
node server.js          # 預設監聽 :8879，PORT 環境變數可改
```

正式部署放在反向代理後面，三條硬性要求：

- **必須 HTTPS**（瀏覽器對 WebRTC / 相機的硬性要求）
- 反代支援 **WebSocket upgrade**
- 反代傳 **`X-Real-IP`**（自動同網分房依據）

Nginx 範例：

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
    # listen 443 ssl; + 憑證（certbot 一鍵簽發）
}
```

## 邊界

分兩檔，取決於兩台裝置是怎麼找到對方的：

| 連線方式 | 下發的 ICE 伺服器 | 位元組走哪 |
| --- | --- | --- |
| 自動探索的本網房 | 只有 STUN | 永遠裝置到裝置 |
| 顯式組隊（掃碼 / 房碼 / 連結） | STUN **+ TURN** | 能直連就直連；中繼只作最後兜底，且如實標註 |

這樣切分是刻意的：預設路徑在程式上就不可能中繼，所以「檔案不經過伺服器」是結構屬性而非承諾。要用中繼必須有一個明確動作——掃碼——用上了介面就顯示**中繼連線**，不藏著。

自架：不設 `TURN_HOST` 就完全不下發任何 ICE 伺服器，行為與舊版純區域網版本一模一樣。設了 `TURN_HOST` + `TURN_SECRET`（與你 coturn 的 `static-auth-secret` 一致）才啟用跨網這一檔。

仍然連不上時，介面會在約 10 秒（有中繼時 20 秒，因為中繼握手更慢）後說出**具體原因**——多播被網路擋、AP 隔離、中繼不可達——而不是無限載入或籠統甩一句「不同網路」。

資料夾**所有瀏覽器都能收**，但**傳**需要系統的資料夾選擇器：iOS Safari 沒有，那裡的入口已隱藏。單個資料夾上限 2000 個檔案——超過會明確提示你先自行壓縮，而不是悄悄少傳一部分。

## 技術

信令 `server.js`（`ws`，按出口 IP / IPv6‑64 前綴自動分房，手動房碼覆蓋）+ 前端 `public/`（WebRTC mesh，64KB 分塊 + 背壓；掃碼 BarcodeDetector 優先、jsQR 兜底）。設計系統見 `design/`。

資料夾**不會**先打包再傳：它以一批普通檔案的形式傳輸，每個檔案帶上相對根目錄的路徑，因此逐檔進度、背壓、斷線重連全部原樣沿用。只有落地寫入這最後一步按平台分叉：File System Access 直接把目錄樹寫進磁碟（串流，記憶體不留資料），其餘瀏覽器由 `public/zip.js`（約 130 行、零相依）收進一個不壓縮的 ZIP。收到的路徑一律當敵意輸入清洗，無法逃出目標目錄；磁碟比網路慢時，接收端會限速發送端，而不是把積壓堆在記憶體裡。

## License

[MIT](../LICENSE)
