<div align="center">

# Zap

**같은 Wi‑Fi, 열고 바로 전송.**

설치할 필요 없는 AirDrop, 로그인이 필요 없는 전송 도우미입니다.
같은 네트워크에 있는 기기들이 하나의 URL을 열면 같은 채팅방에 모이고, 텍스트와 파일은
**P2P로 직접 전송되며 서버를 절대 거치지 않습니다**.

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
한국어 ·
<a href="README.id.md">Indonesia</a> ·
<a href="README.vi.md">Tiếng Việt</a> ·
<a href="README.th.md">ไทย</a> ·
<a href="README.tr.md">Türkçe</a> ·
<a href="README.pl.md">Polski</a> ·
<a href="README.hi.md">हिन्दी</a>
</sub>

</div>

---

## 특징

- 🚀 **앱 설치도, 로그인도, 연락처 추가도 필요 없음** — 브라우저에서 URL만 열면 끝
- 🔒 **파일은 서버를 거치지 않음** — 직접 P2P 전송, 용량 제한 없음, 재압축 없음; 서버는 어떤 데이터도 로그도 남기지 않음
- 👥 **그룹 채팅 + 1:1 채팅** — "전체" 방 하나와 각 기기별 개인 스레드
- 📷 **세 가지 연결 방법** — 같은 네트워크 자동 탐색 / 페이지 내 QR 스캔 / 5자리 방 코드 / 공유 링크
- 🌍 **18개 언어**, 즉시 전환 가능; 🌗 **다크 모드**는 시스템 설정을 따름
- 📝 **대화 기록은 브라우저에만 저장**(IndexedDB) — 다른 기기에서는 보이지 않음
- 🪶 **프레임워크도, 빌드 과정도 없음** — 서버는 `ws` 패키지 하나만 필요하고, 프론트엔드는 순수 바닐라 JS

## 셀프 호스팅

Node ≥ 18 필요.

```bash
git clone https://github.com/sitboy/lanzap.git zap && cd zap
npm install
node server.js          # listens on :8879 by default, override with PORT
```

리버스 프록시 뒤에서 실행하세요. 필수 조건 세 가지:

- **HTTPS 필수** (브라우저가 WebRTC/카메라 사용에 HTTPS를 요구함)
- 프록시는 **WebSocket 업그레이드**를 지원해야 함
- 프록시는 **`X-Real-IP`**를 전달해야 함 (같은 네트워크의 기기를 그룹화하는 데 사용)

Nginx 설정 예시:

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
    # listen 443 ssl; + 인증서 (certbot 명령 한 줄로 발급 가능)
}
```

## 적용 범위

순수 LAN 직접 연결 방식이며(STUN/TURN을 전혀 사용하지 않음), 전송은 **같은 네트워크 안에서만**
동작합니다. 다른 네트워크에서 링크를 열어도 모두 같은 방에 들어와 서로를 볼 수는 있지만
직접 연결은 되지 않으며, 이 경우 무한 로딩 대신 약 10초 후 UI에 명확히 안내됩니다.

## 동작 원리

시그널링은 `server.js`에서 처리합니다(`ws` 사용; 출구 IP/IPv6-64 프리픽스로 기기를 그룹화하며,
수동 방 코드를 입력하면 이 규칙을 덮어씀). 프론트엔드는 `public/`에 있습니다(WebRTC 메시 구조,
백프레셔를 적용한 64KB 단위 청킹; QR 스캔은 `BarcodeDetector`를 우선 사용하고 지원하지 않으면
jsQR로 대체). 디자인 시스템은 `design/`에 있습니다.

## 라이선스

[MIT](../LICENSE)
