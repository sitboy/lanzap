/* lan-transfer 前端:信令(ws) + WebRTC mesh + 分块文件直传 + 本地历史(IndexedDB)
 * 原则:服务器只递名片;文字/文件全部走 RTCDataChannel 点对点 */
'use strict';

const $ = id => document.getElementById(id);
const list = $('list'), peersBar = $('peers'), txt = $('txt'),
      send = $('send'), plus = $('plus'), fileInput = $('file');

/* ── i18n 渲染(可重入:切语言原地热刷新,不 reload) ── */
const isDesktopLayout = () => window.matchMedia('(min-width: 760px)').matches;
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  txt.placeholder = t(isDesktopLayout() ? 'input_placeholder_desktop' : 'input_placeholder');
  const ci = document.getElementById('code-input');
  if (ci) ci.placeholder = t('code_placeholder');
  $('lang').textContent = LANG.split('-')[0].toUpperCase();
  document.title = t('app_title') + (LANG.startsWith('zh') ? ' Zap' : '');
  $('hero-desc').innerHTML = t('hero_desc', { url: `<b>${location.host}</b>` });
  // 桌面首屏无后摄:主按钮=出示二维码(复用现有 hero_qr 键,18 语言都有)
  const hs = $('hero-scan');
  if (hs) hs.querySelector('span').textContent = t(isDesktopLayout() ? 'hero_qr' : 'hero_scan');
  updateRoomState();
}
// 房间状态一行:只在"手动房码房"里显示房码——看见房码=在共享房,看不见=在本网络。干净可讲
function updateRoomState() {
  $('foot-note').textContent = window.__manual && window.__room
    ? t('direct') + ' · ' + t('room') + ' ' + window.__room
    : t('direct');
}

/* 语言菜单:选择即热切换 */
const langMenu = document.createElement('div');
langMenu.id = 'langmenu';
document.body.appendChild(langMenu);
function renderLangMenu() {
  langMenu.innerHTML = LANGS.map(([code, name]) =>
    `<div class="lm-item${code === LANG ? ' on' : ''}" data-code="${code}">${name}</div>`).join('');
}
function setLang(code) {
  window.LANG = code; localStorage.lang = code;
  langMenu.classList.remove('show');
  applyI18n(); renderPeers();          // 静态标签 + 动态区全部原地重绘
}
langMenu.onclick = e => { const c = e.target.dataset.code; if (c) setLang(c); };
function toggleLangMenu(anchor) {
  renderLangMenu();
  const r = anchor.getBoundingClientRect();
  langMenu.style.top = (r.bottom + 6) + 'px';
  const rightSpace = window.innerWidth - r.right;
  langMenu.style.left = 'auto';
  langMenu.style.right = Math.max(8, rightSpace - 4) + 'px';
  langMenu.classList.toggle('show');
}
$('lang').onclick = e => { e.stopPropagation(); toggleLangMenu(e.currentTarget); };
document.addEventListener('click', e => {
  if (!langMenu.contains(e.target)) langMenu.classList.remove('show');
});

/* ── 设备身份 ── */
let myId = localStorage.deviceId;
if (!myId) { myId = 'd' + Math.random().toString(36).slice(2, 10); localStorage.deviceId = myId; }
let myName = localStorage.deviceName;
if (!myName) {
  const ua = navigator.userAgent;
  myName = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? ((ua.match(/;\s*([^;)]+?)\s+Build\//) || [,'Android'])[1])
    : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Web';
  localStorage.deviceName = myName;
}
const myKind = /iPhone|iPad|Android/.test(navigator.userAgent) ? 'mobile' : 'desktop';
document.getElementById('back').onclick = () => switchConv('all');
$('rename').onclick = () => {
  const n = prompt(t('rename_prompt'), myName);
  if (n && n.trim()) { myName = n.trim().slice(0, 20); localStorage.deviceName = myName;
    ws && ws.readyState === 1 && ws.send(JSON.stringify({ type: 'rename', name: myName }));
    renderPeers(); }
};

/* ── 本地历史(IndexedDB:文字+文件元数据;文件内容不持久化) ── */
let db;
const dbReady = new Promise(ok => {
  const rq = indexedDB.open('lan-transfer', 1);
  rq.onupgradeneeded = () => rq.result.createObjectStore('msgs', { keyPath: 'k', autoIncrement: true });
  rq.onsuccess = () => { db = rq.result; ok(); };
  rq.onerror = () => ok();
});
function saveMsg(m) { if (db) try { const { blob, ...rest } = m;
  db.transaction('msgs', 'readwrite').objectStore('msgs').add(rest); } catch {} }

/* ── 会话模型:'all'=群聊,peerId=私聊;消息入内存+DB,按当前会话渲染 ── */
let msgs = [];
let currentConv = 'all';
const unread = Object.create(null);
function pushMsg(m) { msgs.push(m); saveMsg(m); }
function bumpUnread(conv) { unread[conv] = (unread[conv] || 0) + 1; renderPeers(); }

function updateTitle() {
  const el = document.querySelector('header .title');
  const back = document.getElementById('back');
  if (currentConv === 'all') {
    el.dataset.i18n = 'app_title'; el.textContent = t('app_title');
    if (back) back.style.display = 'none';
    document.getElementById('rename').style.display = '';
  } else {
    delete el.dataset.i18n;
    const p = peers.get(currentConv);
    el.textContent = p ? p.name : '…';
    if (back) back.style.display = 'flex';
    document.getElementById('rename').style.display = 'none';
  }
}
function renderConv() {
  const hero = document.getElementById('hero');
  list.innerHTML = ''; list.appendChild(hero);
  lastTs = 0;
  msgs.filter(m => (m.conv || 'all') === currentConv).slice(-200).forEach(m => {
    if (m.type === 'text') addText(m, !!m.me);
    else {
      const ui = addFileBubble(m, !!m.me);
      if (m.me && m.to) ui.to(m.to);
      ui.done(m.blob || null);
    }
  });
  scrollBottom();
}
function switchConv(conv) {
  currentConv = conv;
  delete unread[conv];
  renderConv(); renderPeers(); updateTitle();
}

/* ── UI 渲染 ── */
let lastTs = 0;
const fmtSize = n => n > 1048576 ? (n/1048576).toFixed(1)+' MB' : n > 1024 ? (n/1024).toFixed(1)+' KB' : n+' B';
const fmtTime = ts => { const d = new Date(ts), now = new Date();
  const hm = ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
  return d.toDateString() === now.toDateString() ? hm : (d.getMonth()+1)+'/'+d.getDate()+' '+hm; };
const isImg = n => /\.(png|jpe?g|gif|webp)$/i.test(n);
const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* 头像(近传规格):自己=品牌绿渐变,他人=蓝;圆角10;手机/电脑白色线条图形 */
let _gid = 0;
function avatarSvg(kind, me) {
  const glyph = kind === 'mobile'
    ? '<rect x="14" y="9" width="12" height="21" rx="2.5" fill="none" stroke="#fff" stroke-width="2"/><circle cx="20" cy="26" r="1.4" fill="#fff"/>'
    : '<rect x="8" y="10" width="24" height="15" rx="2" fill="none" stroke="#fff" stroke-width="2"/><path d="M16 30h8M20 25v5" stroke="#fff" stroke-width="2" stroke-linecap="round"/>';
  if (!me) return `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#1485EE"/>${glyph}</svg>`;
  const id = 'g' + (++_gid);
  return `<svg viewBox="0 0 40 40"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#12C88B"/><stop offset="1" stop-color="#0E9E6E"/></linearGradient></defs>
    <rect width="40" height="40" rx="10" fill="url(#${id})"/>${glyph}</svg>`;
}

/* 文件图标:微信风折角纸+类型色块字母 */
const FTYPE = [
  [/\.pdf$/i, 'PDF', '#e5252a'], [/\.(doc|docx)$/i, 'W', '#4b8bf5'],
  [/\.(xls|xlsx|csv)$/i, 'X', '#22b14c'], [/\.(ppt|pptx)$/i, 'P', '#f6712c'],
  [/\.apk$/i, 'APK', '#3ddc84'], [/\.(zip|rar|7z|gz)$/i, 'ZIP', '#f7b500'],
  [/\.(mp4|mov|mkv|avi)$/i, '▶', '#9b59f5'], [/\.(mp3|m4a|flac|wav)$/i, '♪', '#f5679b'],
  [/\.(txt|md|log)$/i, 'TXT', '#8a9aa9'],
];
function fileIconSvg(name) {
  // 未知类型:用扩展名本身当标签,比问号有信息量
  const ext = (name.match(/\.([a-z0-9]{1,4})$/i) || [])[1];
  let label = ext ? ext.toUpperCase().slice(0, 3) : 'FILE', color = '#a6b6c3';
  for (const [re, l, c] of FTYPE) if (re.test(name)) { label = l; color = c; break; }
  return `<svg viewBox="0 0 40 46">
    <path d="M6 4a3 3 0 013-3h16l9 9v29a3 3 0 01-3 3H9a3 3 0 01-3-3z" fill="#fff" stroke="#dfe5ea" stroke-width="1.4"/>
    <path d="M25 1l9 9h-7a2 2 0 01-2-2z" fill="#eef2f5" stroke="#dfe5ea" stroke-width="1.2"/>
    <rect x="3" y="24" width="27" height="13" rx="2.5" fill="${color}"/>
    <text x="16.5" y="33.5" font-size="${label.length > 2 ? 7.5 : 9}" font-weight="700"
      fill="#fff" text-anchor="middle" font-family="-apple-system,Arial">${label}</text>
  </svg>`;
}

function timeDivider(ts) {
  if (ts - lastTs > 5*60*1000) {
    const d = document.createElement('div'); d.className = 'time'; d.textContent = fmtTime(ts);
    list.appendChild(d);
  }
  lastTs = ts;
}
function sysLine(text) {
  const d = document.createElement('div'); d.className = 'sys'; d.textContent = text;
  list.appendChild(d); scrollBottom();
}
function scrollBottom() { list.scrollTop = list.scrollHeight; }
function nearBottom() { return list.scrollHeight - list.scrollTop - list.clientHeight < 100; }

function addText(m, mine) {
  timeDivider(m.ts);
  const row = document.createElement('div');
  row.className = 'row' + (mine ? ' me' : '');
  row.innerHTML = `<div class="avatar">${avatarSvg(mine ? myKind : (m.kind || 'mobile'), mine)}</div><div class="wrap">
    <div class="dev">${mine ? '' : esc(m.from)}</div><div class="bubble text"></div></div>`;
  row.querySelector('.bubble').textContent = m.text;
  list.appendChild(row); scrollBottom();
}

// 文件气泡(发送/接收共用,带进度与状态)
function addFileBubble(meta, mine) {
  timeDivider(meta.ts || Date.now());
  const row = document.createElement('div');
  row.className = 'row' + (mine ? ' me' : '');
  row.innerHTML = `<div class="avatar">${avatarSvg(mine ? myKind : (meta.kind || 'mobile'), mine)}</div><div class="wrap">
    <div class="dev">${mine ? '' : esc(meta.from || '')}</div>
    <div class="bubble file"><div class="fmain">
      <div class="finfo"><div class="fname"></div><div class="fsize">${fmtSize(meta.size)}</div></div>
      <div class="ficon">${fileIconSvg(meta.name)}</div></div>
      <div class="prog"><div></div></div>
      <div class="ffoot"><span class="fstat">${t(mine ? 'sending' : 'receiving')}</span><span class="fto"></span></div>
    </div></div>`;
  row.querySelector('.fname').textContent = meta.name;
  list.appendChild(row); scrollBottom();
  return {
    prog: p => { row.querySelector('.prog>div').style.width = (p*100).toFixed(1) + '%'; },
    to: names => { row.querySelector('.fto').textContent = names; },
    done: blob => {
      row.querySelector('.prog').remove();
      const st = row.querySelector('.fstat');
      st.textContent = t('sent'); st.classList.add('ok');
      if (blob) { // 接收方:变成可保存/可预览
        const url = URL.createObjectURL(blob);
        if (isImg(meta.name)) {
          row.querySelector('.wrap').innerHTML =
            `<div class="dev">${esc(meta.from || '')}</div>
             <a class="bubble img" href="${url}" target="_blank"><img src="${url}"></a>`;
        } else {
          const a = document.createElement('a');
          a.href = url; a.download = meta.name;
          a.className = 'bubble file'; a.style.display = 'block';
          a.innerHTML = row.querySelector('.bubble.file').innerHTML;
          a.querySelector('.fstat').textContent = '⬇ ' + t('click_download');
          a.querySelector('.fstat').classList.add('ok');
          a.querySelector('.fto').textContent = fmtSize(meta.size);
          row.querySelector('.bubble.file').replaceWith(a);
        }
        if (nearBottom()) scrollBottom();
      }
    },
    fail: () => { row.querySelector('.prog>div').style.background = 'var(--danger)';
                  row.querySelector('.fstat').textContent = t('failed'); },
  };
}

/* ── 组队:状态无状态化——房码只活在地址栏(#r=),不存 localStorage ──
 * 裸链接/新标签/隐私模式 一律回"本网络大房间";带 #r= 的链接才进对应共享房。
 * 好处:同一网络任何打开方式都进同一大房间,不会因存储隔离(隐私模式)莫名分家 */
let urlRoom = (location.hash.match(/r=([A-Za-z0-9]{4,8})/) || [])[1] || '';
const card = document.getElementById('invite-card');

function inviteUrl() { return location.origin + '/#r=' + urlRoom; }

// 进房=无刷新切换:更新地址栏(hash 即状态)→重连信令。不整页 reload,不写 localStorage
function enterRoom(code) {
  const c = code.toUpperCase();
  if (c === urlRoom) { document.getElementById('mask').classList.remove('show'); return; }
  urlRoom = c;
  history.replaceState(null, '', '#r=' + c);
  document.getElementById('mask').classList.remove('show');
  reconnectRoom();
}
function leaveRoom() {
  urlRoom = '';
  history.replaceState(null, '', location.pathname);   // 清掉 hash=回本网络大房间
  document.getElementById('mask').classList.remove('show');
  reconnectRoom();
}
// 切房:清掉旧房所有 P2P 连接与消息,用新房重连 ws(无刷新)
function reconnectRoom() {
  for (const [, p] of peers) { try { p.pc && p.pc.close(); } catch {} }
  peers.clear();
  if (ws) { ws.onclose = null; try { ws.close(); } catch {} }
  currentConv = 'all';
  renderConv(); renderPeers(); updateTitle();
  connect();
}
function setPane(join) {
  card.classList.toggle('join', join);
  document.getElementById('to-join').classList.toggle('on', join);
  document.getElementById('to-invite').classList.toggle('on', !join);
}
function ensureRoom() {
  // 出码需要有房码;没有就地生成一个并记住(无刷新),弹层随即显示二维码
  if (!urlRoom) enterRoomQuiet(Math.random().toString(36).slice(2, 7).replace(/[01oil]/g, 'x'));
}
function enterRoomQuiet(code) {   // 同 enterRoom 但不关弹层(用于"邀请面"就地出码)
  urlRoom = code.toUpperCase();
  history.replaceState(null, '', '#r=' + urlRoom);
  reconnectRoom();
}
function renderInvitePane() {
  const qr = document.getElementById('qr'); qr.innerHTML = '';
  new QRCode(qr, { text: inviteUrl(), width: 168, height: 168, correctLevel: QRCode.CorrectLevel.M });
  document.getElementById('room-label').innerHTML =
    `<small>${t('room')}</small><b>${urlRoom}</b>`;
}
function showInvite(pane) {
  // 默认面按角色习惯:手机多为加入方(扫码),桌面多为邀请方(出码)
  const join = pane ? pane === 'join' : (myKind === 'mobile' && !urlRoom);
  setPane(join);
  if (!join) { ensureRoom(); renderInvitePane(); }
  document.getElementById('mask').classList.add('show');
}
document.getElementById('to-join').onclick = () => setPane(true);
document.getElementById('to-invite').onclick = () => { setPane(false); ensureRoom(); renderInvitePane(); };
document.getElementById('close-btn').onclick = () => document.getElementById('mask').classList.remove('show');
document.getElementById('mask').onclick = e => { if (e.target.id === 'mask') e.target.classList.remove('show'); };
document.getElementById('copy-btn').onclick = async e => {
  try { await navigator.clipboard.writeText(inviteUrl()); }
  catch { const i = document.createElement('input'); i.value = inviteUrl();
    document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); }
  e.target.textContent = t('copied');
  setTimeout(() => { e.target.textContent = t('copy_link'); }, 1500);
};
document.getElementById('leave-btn').onclick = leaveRoom;

/* 输码加入 */
const codeInput = document.getElementById('code-input'), codeGo = document.getElementById('code-go');
codeInput.placeholder = t('code_placeholder');
codeInput.oninput = () => codeGo.classList.toggle('on', codeInput.value.trim().length >= 4);
codeGo.onclick = () => { const v = codeInput.value.trim(); if (v.length >= 4) enterRoom(v); };
codeInput.onkeydown = e => { if (e.key === 'Enter') codeGo.onclick(); };

/* 站内扫码:BarcodeDetector 原生优先,jsQR 懒加载兜底(iOS 等) */
const scanBox = document.getElementById('scan'), cam = document.getElementById('cam');
let scanStream = null, scanTimer = null;
function loadScript(src) { return new Promise((ok, no) => {
  const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no;
  document.head.appendChild(s); }); }
async function startScan() {
  document.getElementById('mask').classList.remove('show');
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 } } });
  } catch { alert(t('camera_fail')); return; }
  cam.srcObject = scanStream;
  try { await cam.play(); } catch {}
  scanBox.classList.add('show');
  // jsQR 软解为主力:国产安卓无 Google 服务时 BarcodeDetector 是空壳(API 在、detect 永远无结果),
  // 不能作为依赖,只能当加速器
  if (!window.jsQR) { try { await loadScript('jsqr.min.js'); } catch {} }
  let bd = null;
  if ('BarcodeDetector' in window) { try { bd = new BarcodeDetector({ formats: ['qr_code'] }); } catch {} }
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });
  let busy = false;
  scanTimer = setInterval(async () => {
    if (!cam.videoWidth || busy) return;
    busy = true;
    let text = '';
    if (bd) { try { const r = await bd.detect(cam); if (r[0]) text = r[0].rawValue; } catch { bd = null; } }
    if (!text && window.jsQR) {
      // 缩到 640 宽解码:速度 x4,识别率不受影响
      const w = 640, h = Math.round(cam.videoHeight * w / cam.videoWidth);
      cv.width = w; cv.height = h;
      cx.drawImage(cam, 0, 0, w, h);
      const d = cx.getImageData(0, 0, w, h);
      const r = jsQR(d.data, w, h, { inversionAttempts: 'dontInvert' });
      if (r) text = r.data;
    }
    busy = false;
    if (text) {
      const m = text.match(/#r=([A-Za-z0-9]{4,8})/) || text.match(/^([A-Za-z0-9]{4,8})$/);
      if (m) { stopScan(); enterRoom(m[1]); }   // 只认本产品的房码,别的二维码不理
    }
  }, 260);
}
function stopScan() {
  clearInterval(scanTimer); scanTimer = null;
  if (scanStream) { scanStream.getTracks().forEach(tr => tr.stop()); scanStream = null; }
  scanBox.classList.remove('show');
}
document.getElementById('scan-btn').onclick = startScan;
document.getElementById('scan-cancel').onclick = stopScan;

/* 空态引导(M1)与顶栏/中栏入口 */
// 首屏主按钮:手机=扫码连接对方;桌面(无后摄)=亮出自己二维码让手机扫
document.getElementById('hero-scan').onclick = () => isDesktopLayout() ? showInvite('invite') : startScan();
document.getElementById('scan-top').onclick = startScan;
document.querySelector('#hero .alt a[data-act=code]').onclick = () => {
  showInvite('join'); setTimeout(() => codeInput.focus(), 100);
};
document.querySelector('#hero .alt a[data-act=qr]').onclick = () => showInvite('invite');
const dlPlus = document.getElementById('dl-plus'), dlInvite = document.getElementById('dl-invite');
if (dlPlus) dlPlus.onclick = () => showInvite();
if (dlInvite) dlInvite.onclick = () => showInvite();

/* ── 信令连接 ── */
let ws, peers = new Map(); // id -> {name, ua, pc, dc, sendQueue, recving}
let connbar;
function showConnbar(show) {
  if (!connbar) { connbar = document.createElement('div'); connbar.id = 'connbar';
    document.getElementById('main').prepend(connbar); }
  connbar.textContent = t('reconnecting');
  connbar.classList.toggle('show', show);
}
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  const slow = setTimeout(() => showConnbar(true), 1500);  // 1.5s 没连上才显示,避免闪烁
  ws.addEventListener('open', () => { clearTimeout(slow); showConnbar(false); });
  ws.addEventListener('close', () => { clearTimeout(slow); showConnbar(true); });
  ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', id: myId, name: myName,
    room: urlRoom ? urlRoom.toUpperCase() : undefined,
    ua: /iPhone|iPad|Android/.test(navigator.userAgent) ? 'mobile' : 'desktop' }));
  ws.onmessage = async e => {
    const m = JSON.parse(e.data);
    if (m.type === 'peers') {
      if (m.room) { window.__room = m.room; window.__manual = !!m.manual; updateRoomState(); }
      for (const p of m.peers) addPeer(p, true);   // 我是后来者:向已在场者发起连接
      renderPeers();
    } else if (m.type === 'peer-joined') {
      // 同 id 重连(如对方刷新页面):销毁残留的旧连接再重建,否则信令会打在死 pc 上
      const stale = peers.get(m.peer.id);
      if (stale) { try { stale.pc && stale.pc.close(); } catch {} peers.delete(m.peer.id); }
      addPeer(m.peer, false);                       // 对方后来:等它发起
      renderPeers(); sysLine(t('peer_joined', { name: m.peer.name }));
    } else if (m.type === 'peer-left') {
      const p = peers.get(m.id);
      if (p) { sysLine(t('peer_left', { name: p.name })); try { p.pc && p.pc.close(); } catch {}
               peers.delete(m.id);
               if (currentConv === m.id) switchConv('all'); else renderPeers(); }
    } else if (m.type === 'peer-renamed') {
      const p = peers.get(m.id); if (p) { p.name = m.name; renderPeers(); }
    } else if (m.type === 'signal') {
      handleSignal(m.from, m.data);
    }
  };
  ws.onclose = () => setTimeout(connect, 2000);
}

function badgeHtml(conv) {
  const n = unread[conv];
  return n ? `<div class="badge">${n > 99 ? '99+' : n}</div>` : '';
}
function renderPeers() {
  // 移动:横向设备条(头像=会话入口;自己头像=回群聊)
  peersBar.innerHTML = '';
  const selfEl = document.createElement('div');
  selfEl.className = 'peer self' + (currentConv === 'all' ? ' cur' : '');
  selfEl.innerHTML = `<div class="pa">${avatarSvg(myKind, true)}<div class="dot on"></div>${badgeHtml('all')}</div>
    <div class="pn">${esc(myName)}</div>`;
  selfEl.onclick = () => switchConv('all');
  peersBar.appendChild(selfEl);
  for (const [id, p] of peers) {
    const el = document.createElement('div');
    el.className = 'peer' + (currentConv === id ? ' cur' : '');
    const dotCls = p.dc && p.dc.readyState === 'open' ? ' on' : (p.stuck ? ' off' : '');
    el.innerHTML = `<div class="pa">${avatarSvg(p.ua === 'mobile' ? 'mobile' : 'desktop', false)}
      <div class="dot${dotCls}"></div>${badgeHtml(id)}</div>
      <div class="pn">${esc(p.name)}</div>`;
    el.onclick = () => switchConv(id);
    peersBar.appendChild(el);
  }
  const inv = document.createElement('div');
  inv.className = 'peer invite';
  inv.innerHTML = `<div class="pa">+</div><div class="pn">${t('invite')}</div>`;
  inv.onclick = () => showInvite();
  peersBar.appendChild(inv);

  // 桌面:中栏=会话列表(所有人+每台设备,点击切换,当前高亮)
  const dl = document.getElementById('dl-items');
  if (dl) {
    dl.innerHTML = '';
    const allRow = document.createElement('div');
    allRow.className = 'dl-row' + (currentConv === 'all' ? ' cur' : '');
    allRow.innerHTML = `<div class="pa"><svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#10B981"/>
      <circle cx="14.5" cy="15" r="4.6" fill="none" stroke="#fff" stroke-width="2"/>
      <circle cx="26" cy="15.6" r="3.6" fill="none" stroke="#DFF6EC" stroke-width="1.8"/>
      <path d="M6.5 30c.8-4.4 4.2-7 8-7s7.2 2.6 8 7" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
      <path d="M25 23.4c3.2.3 5.9 2.6 6.6 6.1" fill="none" stroke="#DFF6EC" stroke-width="1.8" stroke-linecap="round"/></svg>
      ${badgeHtml('all')}</div>
      <div class="di"><div class="dn">${t('all')}</div><div class="ds">${t('devices_title')} · ${peers.size + 1}</div></div>`;
    allRow.onclick = () => switchConv('all');
    dl.appendChild(allRow);
    const selfRow = document.createElement('div');
    selfRow.className = 'dl-row selfrow';
    selfRow.innerHTML = `<div class="pa">${avatarSvg(myKind, true)}<div class="dot on"></div></div>
      <div class="di"><div class="dn">${esc(myName)}</div><div class="ds">${t('self_tag')}</div></div>`;
    dl.appendChild(selfRow);
    for (const [id, p] of peers) {
      const on = p.dc && p.dc.readyState === 'open';
      const row = document.createElement('div');
      row.className = 'dl-row' + (currentConv === id ? ' cur' : '');
      const st = on ? 'st_on' : (p.stuck ? 'st_stuck' : 'st_mid');
      row.innerHTML = `<div class="pa">${avatarSvg(p.ua === 'mobile' ? 'mobile' : 'desktop', false)}
        <div class="dot${on ? ' on' : (p.stuck ? ' off' : '')}"></div>${badgeHtml(id)}</div>
        <div class="di"><div class="dn">${esc(p.name)}</div>
        <div class="ds${on ? ' on' : (p.stuck ? ' bad' : '')}">${t(st)}</div></div>`;
      row.onclick = () => switchConv(id);
      dl.appendChild(row);
    }
  }

  // 空态引导(M1):群聊且网内只有自己时显示
  document.getElementById('hero').classList.toggle('show', peers.size === 0 && currentConv === 'all');
  updateTitle();
}

/* ── WebRTC mesh ── */
function addPeer(info, initiator) {
  if (peers.has(info.id)) return;
  const p = { name: info.name, ua: info.ua, pc: null, dc: null, queue: [], sending: false, recv: null,
              stuck: false };
  peers.set(info.id, p);
  // 10 秒连不上=大概率不同网络(本工具零 STUN,只做局域网直连):明确告知而不是永远转圈
  p.stuckTimer = setTimeout(() => {
    if (!p.dc || p.dc.readyState !== 'open') {
      p.stuck = true; renderPeers();
      sysLine(t('no_direct', { name: p.name }));
    }
  }, 10000);
  const pc = new RTCPeerConnection({ iceServers: [] }); // 纯局域网:host candidates 足够,不依赖外部 STUN
  p.pc = pc;
  pc.onicecandidate = ev => ev.candidate &&
    ws.send(JSON.stringify({ type: 'signal', to: info.id, data: { ice: ev.candidate } }));
  pc.onconnectionstatechange = () => {
    if (['failed', 'closed'].includes(pc.connectionState)) { p.dc = null; renderPeers(); }
  };
  if (initiator) {
    setupDC(p, pc.createDataChannel('t', { ordered: true }), info.id);
    pc.createOffer().then(o => pc.setLocalDescription(o))
      .then(() => ws.send(JSON.stringify({ type: 'signal', to: info.id, data: { sdp: pc.localDescription } })));
  } else {
    pc.ondatachannel = ev => setupDC(p, ev.channel, info.id);
  }
}

async function handleSignal(from, data) {
  let p = peers.get(from);
  if (!p) return;
  const pc = p.pc;
  try {
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        ws.send(JSON.stringify({ type: 'signal', to: from, data: { sdp: pc.localDescription } }));
      }
    } else if (data.ice) {
      await pc.addIceCandidate(data.ice);
    }
  } catch (e) { console.warn('signal error', e); }
}

const CHUNK = 64 * 1024, HIGH_WATER = 8 * 1024 * 1024;
function setupDC(p, dc, id) {
  p.dc = dc;
  dc.binaryType = 'arraybuffer';
  dc.bufferedAmountLowThreshold = 1024 * 1024;
  dc.onopen = () => { p.stuck = false; clearTimeout(p.stuckTimer); renderPeers(); pump(p); };
  dc.onclose = () => { p.dc = null; renderPeers(); };
  dc.onmessage = ev => {
    if (typeof ev.data === 'string') {
      const m = JSON.parse(ev.data);
      if (m.t === 'text') {
        const conv = m.scope === 'dm' ? id : 'all';
        const rec = { conv, type: 'text', from: p.name, kind: p.ua, text: m.text, ts: m.ts };
        pushMsg(rec);
        if (conv === currentConv) addText(rec, false); else bumpUnread(conv);
      } else if (m.t === 'meta') {
        const conv = m.scope === 'dm' ? id : 'all';
        p.recv = { meta: { ...m, from: p.name, kind: p.ua }, conv, chunks: [], got: 0,
                   ui: conv === currentConv
                     ? addFileBubble({ ...m, from: p.name, kind: p.ua }, false) : null };
      } else if (m.t === 'end' && p.recv) {
        const r = p.recv; p.recv = null;
        const blob = new Blob(r.chunks, { type: r.meta.mime || 'application/octet-stream' });
        const rec = { conv: r.conv, type: 'file', from: p.name, kind: p.ua,
                      name: r.meta.name, size: r.meta.size, ts: r.meta.ts, blob };
        pushMsg(rec);
        if (r.ui) r.ui.done(blob); else bumpUnread(r.conv);
      }
    } else if (p.recv) {
      p.recv.chunks.push(ev.data);
      p.recv.got += ev.data.byteLength;
      if (p.recv.ui) p.recv.ui.prog(p.recv.got / p.recv.meta.size);
    }
  };
}

/* 发送队列:每 peer 串行,尊重背压 */
async function pump(p) {
  if (p.sending || !p.dc || p.dc.readyState !== 'open') return;
  const job = p.queue.shift();
  if (!job) return;
  p.sending = true;
  try {
    if (job.kind === 'text') {
      p.dc.send(JSON.stringify({ t: 'text', text: job.text, ts: job.ts, scope: job.scope }));
    } else {
      p.dc.send(JSON.stringify({ t: 'meta', name: job.file.name, size: job.file.size,
                                 mime: job.file.type, ts: job.ts, scope: job.scope }));
      let off = 0;
      while (off < job.file.size) {
        if (p.dc.bufferedAmount > HIGH_WATER) {
          await new Promise(ok => { p.dc.onbufferedamountlow = ok; });
          continue;
        }
        const buf = await job.file.slice(off, off + CHUNK).arrayBuffer();
        p.dc.send(buf);
        off += buf.byteLength;
        job.onprog && job.onprog(off / job.file.size);
      }
      p.dc.send(JSON.stringify({ t: 'end' }));
      job.ondone && job.ondone();
    }
  } catch (e) { job.onfail && job.onfail(); }
  p.sending = false;
  pump(p);
}

/* ── 发送入口:群聊=全员,私聊=目标设备 ── */
function targets() { return [...peers.values()].filter(p => p.dc && p.dc.readyState === 'open'); }
function convTargets() {
  if (currentConv === 'all') return targets();
  const p = peers.get(currentConv);
  return p && p.dc && p.dc.readyState === 'open' ? [p] : [];
}
const convScope = () => currentConv === 'all' ? 'all' : 'dm';

function sendText() {
  const text = txt.value.trim(); if (!text) return;
  txt.value = ''; txt.dispatchEvent(new Event('input'));
  const ts = Date.now();
  const rec = { conv: currentConv, type: 'text', from: myName, me: 1, text, ts };
  pushMsg(rec); addText(rec, true);
  const tg = convTargets();
  if (!tg.length) {
    const pp = currentConv !== 'all' && peers.get(currentConv);
    sysLine(pp ? t('no_direct', { name: pp.name }) : t('only_you'));
    return;
  }
  tg.forEach(p => { p.queue.push({ kind: 'text', text, ts, scope: convScope() }); pump(p); });
}
send.onclick = sendText;
txt.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); sendText(); }
});
txt.addEventListener('input', () => {
  send.classList.toggle('show', !!txt.value.trim());
  plus.classList.toggle('hidden', !!txt.value.trim());
  txt.style.height = 'auto'; txt.style.height = Math.min(txt.scrollHeight, 110) + 'px';
});

plus.onclick = () => fileInput.click();
const attach = document.getElementById('attach');
if (attach) attach.onclick = () => fileInput.click();
fileInput.onchange = () => { [...fileInput.files].forEach(sendFile); fileInput.value = ''; };
function sendFile(file) {
  const ts = Date.now(), tg = convTargets();
  const ui = addFileBubble({ name: file.name, size: file.size, ts }, true);
  const names = tg.map(p => p.name).join(' · ');
  pushMsg({ conv: currentConv, type: 'file', from: myName, me: 1,
            name: file.name, size: file.size, ts, to: names });
  if (!tg.length) {
    ui.fail();
    const pp = currentConv !== 'all' && peers.get(currentConv);
    sysLine(pp ? t('no_direct', { name: pp.name }) : t('only_you'));
    return;
  }
  ui.to(names);   // 送达状态行:接收方名单(设计 D1)
  let doneCount = 0;
  tg.forEach(p => {
    p.queue.push({ kind: 'file', file, ts, scope: convScope(),
      onprog: r => ui.prog(r),
      ondone: () => { if (++doneCount === tg.length) ui.done(null); },
      onfail: () => ui.fail() });
    pump(p);
  });
}

/* ── 桌面边栏 ── */
const sideAvatar = document.getElementById('side-avatar');
if (sideAvatar) {
  sideAvatar.innerHTML = avatarSvg(myKind, true);
  sideAvatar.title = myName;
  sideAvatar.onclick = $('rename').onclick;
  document.getElementById('nav-invite').onclick = () => showInvite();
  document.getElementById('nav-invite').title = t('invite');
  const nm = document.getElementById('nav-menu');
  nm.onclick = e => { e.stopPropagation(); toggleLangMenu(nm); };
  nm.title = 'Language';
}

/* ── 启动:渲染历史 → 连接 ── */
applyI18n();
dbReady.then(() => {
  if (!db) { renderConv(); return connect(); }
  const rq = db.transaction('msgs').objectStore('msgs').getAll();
  rq.onsuccess = () => {
    msgs = (rq.result || []).map(m => ({ ...m, conv: m.conv || 'all' }));
    renderConv();
    if (msgs.length) sysLine(t('history_note'));
    connect();
  };
  rq.onerror = () => { renderConv(); connect(); };
});
