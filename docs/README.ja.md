<div align="center">

# Zap

**同じWi‑Fi、開いて送るだけ。**

インストール不要のAirDrop——ログイン不要の転送ヘルパー。
同じネットワーク上のデバイスが1つのURLを開くだけで同じチャットに入り、テキストやファイルは
**ピアツーピアで送受信され、サーバーには一切触れません**。

[**ライブデモ →**](https://file.joestudy.net)

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
日本語 ·
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

## 特徴

- 🚀 **アプリ不要、ログイン不要、連絡先の追加も不要** — ブラウザでURLを開くだけ
- 🔒 **ファイルはサーバーに一切触れない** — 直接P2P通信、サイズ制限なし、再圧縮なし。サーバーはデータもログも一切保持しない
- 📁 **フォルダごと、構造そのまま** — ドラッグするか選ぶだけ。デスクトップ版 Chromium ではそのままフォルダとしてディスクに復元され、他のブラウザには ZIP が届きます
- 👥 **グループチャットとプライベートチャット** — 「Everyone」ルーム1つに加え、各デバイスとのプライベートスレッド
- 📷 **3通りのペアリング方法** — 同一ネットワークの自動検出 / ページ内QRスキャン / 5文字のルームコード / 共有可能なリンク
- 🌍 **18言語**にその場で切り替え可能。🌗 **ダークモード**はシステム設定に追従
- 📝 **履歴はブラウザ内にのみ保存**（IndexedDB）— 他のデバイスからは見えない
- 🪶 **フレームワーク不要、ビルド不要** — サーバー側は `ws` のみ必要。フロントエンドは素のバニラJS

## セルフホスティング

Node ≥ 18 が必要です。

```bash
git clone https://github.com/sitboy/lanzap.git zap && cd zap
npm install
node server.js          # デフォルトで :8879 で待ち受け、PORTで上書き可能
```

リバースプロキシの背後で実行してください。必須要件は3つです。

- **HTTPSは必須**（WebRTC / カメラの利用にブラウザが要求するため）
- プロキシは **WebSocketアップグレード** をサポートする必要がある
- プロキシは **`X-Real-IP`** を渡す必要がある（同一ネットワーク上のデバイスをグループ化するために使用）

Nginxの設定例。

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
    # listen 443 ssl; + 証明書（certbotなら1コマンドで発行可能）
}
```

## 適用範囲

純粋なLAN内の直接接続のみ（STUN/TURNは一切使用しない）のため、転送は**同一ネットワーク内でのみ**
動作します。異なるネットワーク間でリンクを開いた場合も全員が同じルームに入り互いを見ることは
できますが、直接接続はできません — UIは延々と読み込み続けるのではなく、約10秒後にその旨を
明確に表示します。

フォルダの**受け取り**はどのブラウザでもできますが、**送る**にはフォルダ選択ダイアログが必要です。iOS Safari にはないため、そこでは入口を隠しています。1 フォルダの上限は 2000 ファイル。超えた場合は一部を黙って捨てるのではなく、自分で圧縮するようはっきり案内します。

## 仕組み

シグナリングは `server.js` にあります（`ws` を使用し、送信元IP / IPv6‑64プレフィックスでデバイスを
グループ化。手動のルームコードがあればそちらが優先されます）。加えて `public/` にフロントエンド
があります（WebRTCメッシュ、バックプレッシャー付き64KBチャンク分割。QRスキャンは `BarcodeDetector`
を優先し、なければ jsQR にフォールバック）。デザインシステムは `design/` にあります。

フォルダは送る前に**まとめて圧縮したりしません**。ふつうのファイルの束として流れ、各ファイルがルートからの相対パスを持ちます。そのためファイルごとの進捗・背圧・再接続はそのまま動きます。プラットフォームで分かれるのは最後の「ディスクに書く」段階だけで、File System Access はツリーを直接書き込み（ストリーミング、メモリに溜めません）、それ以外は `public/zip.js`（約 130 行・依存なし）が無圧縮 ZIP にまとめます。受け取ったパスは敵意ある入力として必ず洗浄するので、保存先の外に出ることはありません。ディスクがネットワークより遅いときは、受信側が送信側を減速させ、滞留をメモリに積み上げません。

## ライセンス

[MIT](../LICENSE)
