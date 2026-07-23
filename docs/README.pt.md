<div align="center">

# Zap

**Mesmo Wi‑Fi, abra e envie.**

Um AirDrop que você não precisa instalar — um assistente de transferência sem login.
Dispositivos na mesma rede abrem uma URL e caem no mesmo chat; texto e arquivos
vão **de igual para igual (P2P) e nunca passam pelo servidor**.

[**Live demo →**](https://file.joestudy.net)

<sub>
<a href="../README.md">English</a> ·
<a href="README.zh-CN.md">简体中文</a> ·
<a href="README.zh-TW.md">繁體中文</a> ·
<a href="README.es.md">Español</a> ·
Português ·
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

## Recursos

- 🚀 **Sem app, sem login, sem adicionar contatos** — basta abrir a URL em um navegador
- 🔒 **Os arquivos nunca passam pelo servidor** — P2P direto, sem limite de tamanho, sem recompressão; o servidor não guarda dados nem registros
- 📁 **Pastas inteiras, com a estrutura intacta** — arraste ou selecione; no Chromium de desktop ela é gravada de volta como uma pasta real, nos demais navegadores chega um ZIP
- 👥 **Chats em grupo e privados** — uma sala "Todos" mais uma conversa privada com cada dispositivo
- 📷 **Três formas de parear** — descoberta automática na mesma rede / leitura de QR code na página / código de sala de 5 caracteres / link compartilhável
- 🌍 **18 idiomas**, trocados na hora; 🌗 o **modo escuro** segue o sistema
- 📝 **O histórico vive só no seu navegador** (IndexedDB) — invisível para outros dispositivos
- 🪶 **Zero framework, zero build** — o servidor só precisa do `ws`; o front-end é JS puro

## Hospedagem própria

Requer Node ≥ 18.

```bash
git clone https://github.com/sitboy/lanzap.git zap && cd zap
npm install
node server.js          # listens on :8879 by default, override with PORT
```

Execute atrás de um proxy reverso. Três requisitos obrigatórios:

- **HTTPS é obrigatório** (os navegadores exigem para WebRTC / câmera)
- O proxy precisa suportar **upgrade de WebSocket**
- O proxy precisa repassar **`X-Real-IP`** (usado para agrupar dispositivos na mesma rede)

Exemplo de Nginx:

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
    # listen 443 ssl; + certificado (o certbot emite um com um único comando)
}
```

## Escopo

Conexão direta pura por LAN (sem STUN/TURN de nenhum tipo), então as transferências funcionam **somente dentro da mesma rede**. Abrir o link entre redes diferentes ainda coloca todos na mesma sala e eles conseguem se ver, mas não conseguem se conectar diretamente — a interface avisa isso claramente depois de ~10 s em vez de ficar girando para sempre.

Todos os navegadores conseguem **receber** pastas, mas **enviar** exige um seletor de pastas: o Safari do iOS não tem, então lá essa entrada fica oculta. O limite é de 2000 arquivos por pasta; acima disso você é avisado para compactá-la, em vez de perder parte dela silenciosamente.

## Como funciona

A sinalização está em `server.js` (`ws`; agrupa dispositivos pelo IP de saída / prefixo IPv6‑64, um código de sala manual sobrepõe isso) mais o front-end em `public/` (malha WebRTC, fragmentação de 64 KB com back-pressure; a leitura de QR prefere `BarcodeDetector` e recorre ao jsQR). O sistema de design vive em `design/`.

A pasta **não** é empacotada antes do envio: ela viaja como um lote de arquivos comuns, cada um com o seu caminho relativo à raiz, de modo que progresso por arquivo, controle de fluxo e reconexão continuam funcionando igual. Só a última etapa — gravar em disco — se ramifica por plataforma: a File System Access escreve a árvore direto (em streaming, sem nada retido em memória) e o restante é recolhido num ZIP sem compressão pelo `public/zip.js` (~130 linhas, sem dependências). Os caminhos recebidos são tratados como entrada hostil e higienizados, então nada escapa do diretório de destino; quando o disco é mais lento que a rede, o receptor freia o emissor em vez de acumular a fila na memória.

## Licença

[MIT](../LICENSE)
