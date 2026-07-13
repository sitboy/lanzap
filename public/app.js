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
// 房间状态一行:自动房=本网;手动房码房=房间 CODE。看见房码=在共享房,否则在本网络。
function updateRoomState() {
  $('foot-note').textContent = window.__manual && window.__room
    ? t('direct') + ' · ' + t('room') + ' ' + window.__room
    : t('direct') + ' · ' + t('this_network');
}
// 清空本机聊天记录(阅后即焚/退出销毁)
function clearHistory() {
  if (!confirm(t('clear_confirm'))) return;
  msgs = []; myFiles.clear(); offerCards.clear(); recvBlobs.clear();
  if (db) try { db.transaction('msgs', 'readwrite').objectStore('msgs').clear(); } catch {}
  renderConv();
  document.getElementById('mask').classList.remove('show');
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
// deviceId 按标签页(sessionStorage):刷新保留、每个窗口/标签独立、不再和别的窗口同 id 互踢。
let myId = sessionStorage.deviceId;
if (!myId) { myId = 'd' + Math.random().toString(36).slice(2, 10); sessionStorage.deviceId = myId; }
const myKind = /iPhone|iPad|Android/.test(navigator.userAgent) ? 'mobile' : 'desktop';

// id → 稳定哈希(用于默认名后缀;颜色改由服务器分槽,见 PALETTE)
function hashId(s) { let h = 2166136261; for (let i = 0; i < (s || '').length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function hueOf(id) { return hashId(id) % 360; }
// 头像调色板:服务器给每台设备分配一个槽位(join 顺序、房内不撞色),客户端据此取色。
// slot 0 = 品牌绿(哨兵 BRAND,自己/别人看都一致);其后为精选、区分度高的色相。超长回环(局域网罕见)。
const BRAND = 'brand';   // 显式哨兵:区别于 undefined(未知→回落哈希),避免 null 一词多义
const PALETTE = [BRAND, 210, 265, 28, 330, 188, 45, 300, 240, 355];
let mySlot = null;
function slotHue(slot) { return slot == null ? undefined : PALETTE[slot % PALETTE.length]; }
function myColor() { return myHue != null ? myHue : slotHue(mySlot); }   // 自定义色优先,否则槽位色
function refreshSelfAvatars() {                                          // 槽位到手后刷新自己的头像
  const sa = document.getElementById('side-avatar'); if (sa) sa.innerHTML = avatarSvg(myKind, true, myId, myColor());
  renderPeers(); renderConv();
}
// 默认名:设备类型 + id 派生两位后缀(iPhone·K2,天然区分,每标签不同)
function defaultName(id) {
  const ua = navigator.userAgent;
  const base = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? ((ua.match(/;\s*([^;)]+?)\s+Build\//) || [, 'Android'])[1])
    : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Web';
  return base + '·' + hashId(id).toString(36).toUpperCase().slice(-2);
}
let myName = localStorage.deviceName || defaultName(myId);
if (!localStorage.deviceName) localStorage.deviceName = myName;
let myHue = localStorage.deviceHue != null ? +localStorage.deviceHue : null;   // 自定义色相(null=默认)
function peerHue(id) { const p = peers.get(id); return p ? (p.hue != null ? p.hue : slotHue(p.slot)) : undefined; }
document.getElementById('back').onclick = () => switchConv('all');
// 身份编辑面板:改名 + 换色 + 保存并广播(实时同步给房里其他设备,服务器只转发不存)
const SWATCHES = [null, 210, 265, 28, 330];   // null=品牌绿;蓝/紫/橙/粉
let pendingHue = myHue;
function openIdentity() {
  pendingHue = myHue;
  document.getElementById('id-name').value = myName;
  document.getElementById('id-av').innerHTML = avatarSvg(myKind, true, myId, pendingHue != null ? pendingHue : slotHue(mySlot));
  const sw = document.getElementById('id-swatches');
  sw.innerHTML = SWATCHES.map(h => {
    const bg = h == null ? 'linear-gradient(150deg,#12C88B,#0E9E6E)' : `hsl(${h},70%,50%)`;
    return `<div class="id-sw${h === pendingHue ? ' on' : ''}" data-h="${h}" style="background:${bg}"></div>`;
  }).join('');
  sw.querySelectorAll('.id-sw').forEach(el => el.onclick = () => {
    pendingHue = el.dataset.h === 'null' ? null : +el.dataset.h;
    sw.querySelectorAll('.id-sw').forEach(x => x.classList.remove('on')); el.classList.add('on');
    document.getElementById('id-av').innerHTML = avatarSvg(myKind, true, myId, pendingHue != null ? pendingHue : slotHue(mySlot));
  });
  document.getElementById('idmask').classList.add('show');
}
$('rename').onclick = openIdentity;
document.getElementById('id-close').onclick = () => document.getElementById('idmask').classList.remove('show');
document.getElementById('idmask').onclick = e => { if (e.target.id === 'idmask') e.target.classList.remove('show'); };
document.getElementById('id-save').onclick = () => {
  const n = document.getElementById('id-name').value.trim().slice(0, 20);
  if (n) { myName = n; localStorage.deviceName = n; }
  myHue = pendingHue;
  if (myHue == null) delete localStorage.deviceHue; else localStorage.deviceHue = myHue;
  ws && ws.readyState === 1 && ws.send(JSON.stringify({ type: 'rename', name: myName, hue: myHue != null ? myHue : undefined }));
  document.getElementById('idmask').classList.remove('show');
  renderPeers();
  const sa = document.getElementById('side-avatar'); if (sa) { sa.innerHTML = avatarSvg(myKind, true, myId, myColor()); sa.title = myName; }
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
    else if (m.me) {                          // 我发过的文件:群=回执(可被拉);私聊=已发送
      const c = fileCard(m, 'self');
      if ((m.conv || 'all') === 'all') c.selfReceipt(); else c.sent();
      const info = myFiles.get(m.fileId); if (info) info.card = c;
    } else if (recvBlobs.has(m.fileId)) {      // 已收下的文件:直接显"已保存"(切走再切回不丢)
      fileCard(m, 'offer').saved(recvBlobs.get(m.fileId));
    } else renderOffer(m);                     // 还没收的:待下载卡(群通告点了才拉;私聊直推会自动收)
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
// 保存文件而不把 App 顶掉:能用系统分享面板(iOS/安卓原生,不导航)就用,否则触发下载(桌面)。
// 绝不用 target=_blank 打开 blob——iOS Safari 会在当前视图打开、盖掉页面。
async function saveBlob(blob, name) {
  try {
    const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; /* 用户取消分享:不回落下载 */ }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name || 'file';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* 头像:自己=品牌绿渐变;他人=其 id 派生的独特色相(每台一色,人人算出同一个,无需存储) */
let _gid = 0;
function avatarSvg(kind, me, id, hue) {
  const glyph = kind === 'mobile'
    ? '<rect x="14" y="9" width="12" height="21" rx="2.5" fill="none" stroke="#fff" stroke-width="2"/><circle cx="20" cy="26" r="1.4" fill="#fff"/>'
    : '<rect x="8" y="10" width="24" height="15" rx="2" fill="none" stroke="#fff" stroke-width="2"/><path d="M16 30h8M20 25v5" stroke="#fff" stroke-width="2" stroke-linecap="round"/>';
  const g = 'g' + (++_gid);
  // BRAND 哨兵或(自己且无色)=品牌绿;数字=该色相;undefined 的他人=id 哈希兜底(仅未知设备才会走到)
  const isBrand = hue === BRAND || (hue == null && me);
  const stops = isBrand ? ['#12C88B', '#0E9E6E']
    : (() => { const h = typeof hue === 'number' ? hue : hueOf(id); return [`hsl(${h},70%,57%)`, `hsl(${h},72%,43%)`]; })();
  return `<svg viewBox="0 0 40 40"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${stops[0]}"/><stop offset="1" stop-color="${stops[1]}"/></linearGradient></defs>
    <rect width="40" height="40" rx="10" fill="url(#${g})"/>${glyph}</svg>`;
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
  row.innerHTML = `<div class="avatar">${avatarSvg(mine ? myKind : (m.kind || 'mobile'), mine, m.fromId, mine ? myColor() : peerHue(m.fromId))}</div><div class="wrap">
    <div class="dev">${mine ? '' : esc(m.from)}</div><div class="bubble text"></div></div>`;
  row.querySelector('.bubble').textContent = m.text;
  list.appendChild(row); scrollBottom();
}

// 文件通告卡(5 态状态机):role='self'(我分享的·回执) | 'offer'(别人分享的·可下载)
function fileCard(meta, role) {
  timeDivider(meta.ts || Date.now());
  const mine = role === 'self';
  const row = document.createElement('div');
  row.className = 'row filecard' + (mine ? ' me' : '');
  const head = mine ? `<span class="fc-share">↑ ${t('you_shared')}</span>`
                    : `<span class="fc-share">${esc(meta.from || '')} ${t('shared')}</span>`;
  const thumbHtml = meta.thumb ? `<div class="fc-thumb"><img src="${meta.thumb}"></div>` : '';
  row.innerHTML = `<div class="avatar">${avatarSvg(mine ? myKind : (meta.kind || 'mobile'), mine, meta.fromId, mine ? myColor() : peerHue(meta.fromId))}</div>
    <div class="wrap"><div class="dev">${mine ? '' : esc(meta.from || '')}</div>
    <div class="bubble file">
      <div class="fc-head">${head}</div>
      ${thumbHtml}
      <div class="fmain">
        <div class="finfo"><div class="fname"></div><div class="fsize"></div></div>
        <div class="ficon">${meta.thumb ? '' : fileIconSvg(meta.name)}</div></div>
      <div class="fc-act"></div>
    </div></div>`;
  row.querySelector('.fname').textContent = meta.name;
  const sizeEl = row.querySelector('.fsize'), act = row.querySelector('.fc-act');
  sizeEl.textContent = fmtSize(meta.size);
  list.appendChild(row); scrollBottom();

  const api = {
    // 待下载:显示下载按钮
    offer(onDownload) {
      act.innerHTML = `<button class="fc-btn go"><svg viewBox="0 0 20 20" width="15" height="15"><path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 15h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>${t('download')}</button>`;
      act.querySelector('.fc-btn').onclick = onDownload;
    },
    // 下载中:进度+速率+取消
    downloading(onCancel) {
      act.innerHTML = `<div class="prog"><div></div></div>
        <div class="fc-row"><span class="fc-pct">${t('receiving')}</span><a class="fc-cancel">${t('cancel')}</a></div>`;
      act.querySelector('.fc-cancel').onclick = onCancel;
    },
    progress(got, total, speed) {
      const bar = act.querySelector('.prog>div'); if (bar) bar.style.width = (got/total*100).toFixed(1)+'%';
      const pct = act.querySelector('.fc-pct');
      if (pct) pct.textContent = `${t('downloading')} ${Math.round(got/total*100)}%`;
      sizeEl.textContent = `${fmtSize(got)} / ${fmtSize(total)}${speed ? ' · ' + fmtSize(speed) + '/s' : ''}`;
    },
    // 已收到:图片内联预览(不导航),文件给"保存"按钮(走 saveBlob,不顶掉页面)
    saved(blob) {
      if (isImg(meta.name)) {
        const url = URL.createObjectURL(blob);
        const wrap = row.querySelector('.wrap');
        wrap.innerHTML = `<div class="dev">${esc(meta.from || '')}</div>
          <div class="bubble img"><img src="${url}"></div>
          <div class="fc-imgact"><a class="fc-save">${t('save')}</a></div>`;
        wrap.querySelector('.fc-save').onclick = () => saveBlob(blob, meta.name);
      } else {
        sizeEl.innerHTML = `<span class="ok">${t('received')} · ${fmtSize(meta.size)}</span>`;
        act.innerHTML = `<button class="fc-btn go">${t('save')}</button>`;
        act.querySelector('.fc-btn').onclick = () => saveBlob(blob, meta.name);
      }
      if (nearBottom()) scrollBottom();
    },
    // 私聊直推(发送方视角):发送中 → 进度 → 已发送
    sending() {
      act.innerHTML = `<div class="prog"><div></div></div>
        <div class="fc-row"><span class="fc-pct">${t('sending')}</span></div>`;
    },
    sendProgress(got, total, speed) {
      const bar = act.querySelector('.prog>div'); if (bar) bar.style.width = (got/total*100).toFixed(1)+'%';
      const pct = act.querySelector('.fc-pct');
      if (pct) pct.textContent = `${t('sending')} ${Math.round(got/total*100)}%`;
      sizeEl.textContent = `${fmtSize(got)} / ${fmtSize(total)}${speed ? ' · ' + fmtSize(speed) + '/s' : ''}`;
    },
    sent() {
      const bar = act.querySelector('.prog>div'); if (bar) bar.style.width = '100%';
      sizeEl.innerHTML = `<span class="ok">✓ ${t('sent_ok')} · ${fmtSize(meta.size)}</span>`;
      act.innerHTML = '';
    },
    // 发送方离线:置灰+不可获取
    unavailable() {
      row.querySelector('.bubble.file').classList.add('dim');
      act.innerHTML = `<span class="fc-off">◷ ${t('sender_gone')}</span>`;
    },
    // 自己发出的卡:回执"保持页面开启可供下载" + "已被 N 人下载"
    selfReceipt() {
      sizeEl.innerHTML = `${fmtSize(meta.size)} · <span class="fc-hint">${t('keep_open')}</span>`;
      api._dl = new Map();
      act.innerHTML = `<div class="fc-recv"></div>`;
      api._renderRecv();
    },
    _renderRecv() {
      const box = act.querySelector('.fc-recv'); if (!box) return;
      const n = api._dl ? api._dl.size : 0;
      const avs = [...(api._dl || new Map()).entries()].slice(0, 5)
        .map(([id]) => `<span class="fc-av">${avatarSvg('mobile', false, id, peerHue(id))}</span>`).join('');
      box.innerHTML = n ? `${avs}<span class="fc-dln">${t('downloaded_by', { n })}</span>`
                        : `<span class="fc-hint">${t('no_downloads_yet')}</span>`;
    },
    addDownloader(id) { if (api._dl && !api._dl.has(id)) { api._dl.set(id, 1); api._renderRecv(); } },
  };
  return api;
}
// 兼容旧调用名(历史渲染等仍可能用到)
function addFileBubble(meta, mine) { return fileCard(meta, mine ? 'self' : 'offer'); }

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
function enterRoomQuiet(code) {   // 同 enterRoom 但不关弹层(用于"邀请面"就地出码)
  urlRoom = code.toUpperCase();
  history.replaceState(null, '', '#r=' + urlRoom);
  reconnectRoom();
}
function renderInvitePane() {
  const inRoom = !!urlRoom;
  document.getElementById('room-create').style.display = inRoom ? 'none' : '';
  document.getElementById('room-active').style.display = inRoom ? '' : 'none';
  if (!inRoom) return;                     // 本网:只展示"创建私密房"引导,不出码(=不建房、不离网)
  const qr = document.getElementById('qr'); qr.innerHTML = '';
  new QRCode(qr, { text: inviteUrl(), width: 168, height: 168, correctLevel: QRCode.CorrectLevel.M });
  const inp = document.getElementById('room-name-input');
  if (inp && document.activeElement !== inp) inp.value = urlRoom;
}
// 房名可自定义:各设备约定同一个名字即永久同房,穿透任何代理/网络(P2P 判本地)
(function wireRoomNameEdit() {
  const inp = document.getElementById('room-name-input');
  if (!inp) return;
  const commit = () => {
    const v = inp.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (v.length >= 4 && v !== urlRoom) { inp.value = v; enterRoomQuiet(v); renderInvitePane(); }
    else inp.value = urlRoom;
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
  inp.addEventListener('blur', commit);
})();
function showInvite(pane) {
  // 默认面:已在私密房→出码;否则手机默认扫码(加入方)、桌面默认出码引导
  const join = pane ? pane === 'join' : (!urlRoom && myKind === 'mobile');
  setPane(join);
  if (!join) renderInvitePane();     // 不再 ensureRoom(打开组队零副作用,不建房不离网)
  document.getElementById('mask').classList.add('show');
}
document.getElementById('to-join').onclick = () => setPane(true);
document.getElementById('to-invite').onclick = () => { setPane(false); renderInvitePane(); };
// 显式创建私密房(用户主动才离开本网):此刻才生成房码并重连
document.getElementById('create-room-btn').onclick = () => {
  enterRoomQuiet(Math.random().toString(36).slice(2, 7).replace(/[01oil]/g, 'x'));
  renderInvitePane();
};
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
{ const cb = document.getElementById('clear-btn'); if (cb) cb.onclick = clearHistory; }
// 页脚房间状态=常驻逃生口:点一下开组队弹层(本网→建房引导;私密房→出码+返回本网),永不被困
{ const fn = $('foot-note'); if (fn) { fn.style.cursor = 'pointer'; fn.onclick = () => showInvite('invite'); } }

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
/* ── 本地 IP 尽力而为增强 ──
 * 浏览器多半把 host candidate 混淆成 .local(隐私),读不到就回落;能读到就用本地子网当分房键,
 * 让"同 WiFi 但代理出口不同"的设备自动重聚。只在"出口分房落单"时触发,不动常规路径。 */
function readLocalIP() {
  return new Promise(res => {
    let done = false; const fin = ip => { if (!done) { done = true; try { pc.close(); } catch {} res(ip); } };
    let pc;
    try {
      pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('x');
      pc.onicecandidate = e => {
        if (!e.candidate) return fin(null);
        const mm = /([0-9]{1,3}(?:\.[0-9]{1,3}){3})/.exec(e.candidate.candidate || e.candidate.address || '');
        if (mm && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(mm[1])) fin(mm[1]);
      };
      pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => fin(null));
      setTimeout(() => fin(null), 2500);
    } catch { fin(null); }
  });
}
let lanTried = false;
let stuckHintShown = false;   // "同网却连不上"诊断每 session 只提示一次,避免刷屏
function maybeLanReunion() {
  if (lanTried || window.__manual || window.__lanKey || urlRoom) return;   // 已在房/已试过就不动
  lanTried = true;
  setTimeout(async () => {
    if (visiblePeerCount() > 0 || window.__manual) return;    // 出口分房已找到同伴,无需增强
    const ip = await readLocalIP();
    if (!ip) return;                                          // 读不到本地 IP → 老实回落,不做任何事
    window.__lanKey = 'l' + hashId(ip.split('.').slice(0, 3).join('.')).toString(36).slice(-10);
    reconnectRoom();                                          // 用本地子网键重连,同子网设备(含代理)汇合
  }, 6000);
}

function connect() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;   // 已在连/已连:别叠出第二条 ws
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  const slow = setTimeout(() => showConnbar(true), 1500);  // 1.5s 没连上才显示,避免闪烁
  ws.addEventListener('open', () => { clearTimeout(slow); showConnbar(false); lastServerMsg = Date.now(); });
  ws.addEventListener('close', () => { clearTimeout(slow); showConnbar(true); });
  ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', id: myId, name: myName,
    room: urlRoom ? urlRoom.toUpperCase() : undefined,
    lan: window.__lanKey || undefined,     // 尽力而为:读到本地子网就带上,让代理设备同子网重聚
    hue: myHue != null ? myHue : undefined,
    ua: /iPhone|iPad|Android/.test(navigator.userAgent) ? 'mobile' : 'desktop' }));
  ws.onmessage = async e => {
    lastServerMsg = Date.now();                     // 任一服务器消息都刷新活性时间戳(僵尸检测用)
    const m = JSON.parse(e.data);
    if (m.type === 'peers') {
      if (m.slot != null && m.slot !== mySlot) { mySlot = m.slot; refreshSelfAvatars(); }   // 服务器分配的头像槽位
      if (m.room) { window.__room = m.room; window.__manual = !!m.manual; updateRoomState(); }
      // 按服务器权威名单对账:重连(息屏/切后台归来)后,残留的死连接要拆了重建,活的留着
      const ids = new Set(m.peers.map(x => x.id));
      for (const [id, pr] of [...peers]) if (!ids.has(id)) { try { pr.pc && pr.pc.close(); } catch {} peers.delete(id); }
      for (const pinfo of m.peers) {
        const ex = peers.get(pinfo.id);
        if (ex && ex.dc && ex.dc.readyState === 'open') continue;   // 还活着,别动
        if (ex) { try { ex.pc && ex.pc.close(); } catch {} peers.delete(pinfo.id); }  // 半死/残留→拆
        addPeer(pinfo, true);                        // (重)连:我向名单里每台发起
      }
      renderPeers();
      maybeLanReunion();                            // 出口分房若落单,尝试用本地子网重聚代理设备
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
      const p = peers.get(m.id); if (p) { p.name = m.name; if (m.hue != null) p.hue = m.hue; renderPeers(); }
    } else if (m.type === 'signal') {
      handleSignal(m.from, m.data);
    }
  };
  ws.onclose = () => setTimeout(connect, 2000);
}

// 移动端自愈:息屏/切后台会冻结定时器、掐 ws、关 DataChannel;切回来可能是"看着 OPEN 实际死"的僵尸。
// 页面重新可见 / bfcache 恢复 / 网络恢复时,主动判活并整体重连(reconnectRoom 清死连接→按名单重建)。
let lastServerMsg = 0;
function onWake() {
  if (document.visibilityState === 'hidden') return;             // 只在回到前台时自愈
  const dead = !ws || ws.readyState > 1;                         // CLOSING/CLOSED/无
  const stale = Date.now() - lastServerMsg > 35000;              // 超一个心跳周期没听到服务器=僵尸
  if (dead || stale) { showConnbar(true); reconnectRoom(); }
}
document.addEventListener('visibilitychange', onWake);
window.addEventListener('pageshow', e => { if (e.persisted) onWake(); });   // 从 bfcache 恢复
window.addEventListener('online', onWake);
window.addEventListener('focus', onWake);

function badgeHtml(conv) {
  const n = unread[conv];
  return n ? `<div class="badge">${n > 99 ? '99+' : n}</div>` : '';
}
function renderPeers() {
  // 移动:横向设备条(头像=会话入口;自己头像=回群聊)
  peersBar.innerHTML = '';
  const selfEl = document.createElement('div');
  selfEl.className = 'peer self' + (currentConv === 'all' ? ' cur' : '');
  selfEl.innerHTML = `<div class="pa">${avatarSvg(myKind, true, myId, myColor())}<div class="dot on"></div>${badgeHtml('all')}</div>
    <div class="pn">${esc(myName)}</div>`;
  selfEl.onclick = () => switchConv('all');
  peersBar.appendChild(selfEl);
  for (const [id, p] of peers) {
    if (p.stuck) continue;                    // 连不上的(跨网)直接隐去,只露连得上的
    const el = document.createElement('div');
    el.className = 'peer' + (currentConv === id ? ' cur' : '');
    const dotCls = p.dc && p.dc.readyState === 'open' ? ' on' : '';   // 连上=绿,连接中=无色
    el.innerHTML = `<div class="pa">${avatarSvg(p.ua === 'mobile' ? 'mobile' : 'desktop', false, id, peerHue(id))}
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
      <div class="di"><div class="dn">${t('all')}</div><div class="ds">${t('devices_title')} · ${visiblePeerCount() + 1}</div></div>`;
    allRow.onclick = () => switchConv('all');
    dl.appendChild(allRow);
    const selfRow = document.createElement('div');
    selfRow.className = 'dl-row selfrow';
    selfRow.innerHTML = `<div class="pa">${avatarSvg(myKind, true, myId, myColor())}<div class="dot on"></div></div>
      <div class="di"><div class="dn">${esc(myName)}</div><div class="ds">${t('self_tag')}</div></div>`;
    dl.appendChild(selfRow);
    for (const [id, p] of peers) {
      if (p.stuck) continue;                  // 连不上的隐去
      const on = p.dc && p.dc.readyState === 'open';
      const row = document.createElement('div');
      row.className = 'dl-row' + (currentConv === id ? ' cur' : '');
      row.innerHTML = `<div class="pa">${avatarSvg(p.ua === 'mobile' ? 'mobile' : 'desktop', false, id, peerHue(id))}
        <div class="dot${on ? ' on' : ''}"></div>${badgeHtml(id)}</div>
        <div class="di"><div class="dn">${esc(p.name)}</div>
        <div class="ds${on ? ' on' : ''}">${t(on ? 'st_on' : 'st_mid')}</div></div>`;
      row.onclick = () => switchConv(id);
      dl.appendChild(row);
    }
  }

  // 空态引导(M1):群聊且网内没有连得上的设备时显示
  document.getElementById('hero').classList.toggle('show', visiblePeerCount() === 0 && currentConv === 'all');
  updateTitle();
}
function visiblePeerCount() { let n = 0; for (const [, p] of peers) if (!p.stuck) n++; return n; }

/* ── WebRTC mesh ── */
function addPeer(info, initiator) {
  if (peers.has(info.id)) return;
  const p = { name: info.name, ua: info.ua, hue: info.hue, slot: info.slot, pc: null, dc: null, queue: [], sending: false, recv: null,
              stuck: false };
  peers.set(info.id, p);
  // 10 秒连不上:此设备是服务器牵的线(=同出口/同网络),却打洞失败→几乎必是二层被挡
  // (AP 隔离/访客网络/mDNS)。隐去僵尸条,但给一次可操作诊断,别让用户对着转圈发懵
  p.stuckTimer = setTimeout(() => {
    if (!p.dc || p.dc.readyState !== 'open') {
      p.stuck = true;
      if (!stuckHintShown) { stuckHintShown = true; sysLine(t('stuck_hint')); }
      if (currentConv === info.id) switchConv('all'); else renderPeers();
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
  dc.onopen = () => { p.stuck = false; clearTimeout(p.stuckTimer); renderPeers(); pump(p);
    advertiseCatalogTo(p); };   // 这台刚可达:把本机还在提供的群通告补发给它(晚到/刷新都能补收)
  dc.onclose = () => { p.dc = null; renderPeers(); };
  dc.onmessage = ev => {
    if (typeof ev.data === 'string') {
      const m = JSON.parse(ev.data);
      if (m.t === 'text') {                 // 群消息:gossip 去重+转发,身份取帧里的原始发送者
        if (!markSeen(m.mid)) return;
        const rec = { conv: 'all', type: 'text', from: m.from, fromId: m.fromId, kind: m.fromKind, text: m.text, ts: m.ts };
        pushMsg(rec);
        if (currentConv === 'all') addText(rec, false); else bumpUnread('all');
        broadcastFrame(m, id);              // 转发给其余邻居(除来源),扩散到全房
      } else if (m.t === 'dm') {            // 私信:直达,不转发
        const rec = { conv: id, type: 'text', from: m.from, fromId: m.fromId, kind: m.fromKind, text: m.text, ts: m.ts };
        pushMsg(rec);
        if (currentConv === id) addText(rec, false); else bumpUnread(id);
      } else if (m.t === 'offer') {         // 群文件通告:mid 控转发、fileId 控渲染(两级幂等)
        if (markSeen(m.mid)) broadcastFrame(m, id);   // 本 session 首见此 mid → 继续洪泛;否则不再转发
        if (m.fromId === myId) return;      // 自己发的通告不重复渲染
        // 按 fileId 去重:历史重画/实时到达/发送方补发都可能带来同一文件,只保留一张卡
        // (未在看群聊时只 pushMsg 不渲染,故必须查 msgs,不能只查 offerCards)
        if (knownFile(m.fileId)) return;
        const meta = { fileId: m.fileId, name: m.name, size: m.size, mime: m.mime, ts: m.ts,
                       fromId: m.fromId, from: m.from, kind: m.fromKind, thumb: m.thumb };
        pushMsg({ conv: 'all', type: 'file', ...meta });
        if (currentConv === 'all') renderOffer(meta); else bumpUnread('all');
      } else if (m.t === 'pull') {          // 有人要拉我的文件 → 直传给他(不经中继)
        if (m.mid && !markSeen(m.mid)) return;
        if (m.toId !== myId) { if (m.mid) broadcastFrame(m, id); return; }
        const f = myFiles.get(m.fileId); if (!f) return;
        f.card.addDownloader(m.fromId);
        streamFileTo({ id: m.fromId, name: m.from, ua: m.fromKind }, f.file, m.fileId);
      } else if (m.t === 'fmeta') {         // 开始收文件:群=先前点了下载(有 offer 卡);私聊=直推(自动建卡)
        const rec = offerCards.get(m.fileId);
        if (rec && rec.timer) { clearTimeout(rec.timer); rec.timer = null; }
        let card = rec ? rec.card : null;
        const conv = rec ? 'all' : id;      // 有通告卡=群会话;否则=私聊直推,归到发送方(id)
        if (rec) card.downloading(() => {});
        else {                              // 私聊直推:没有通告卡→自动建"接收中"卡
          const meta = { fileId: m.fileId, name: m.name, size: m.size, mime: m.mime,
                         ts: Date.now(), fromId: id, from: p.name, kind: p.ua };
          pushMsg({ conv, type: 'file', ...meta });
          if (currentConv === conv) { card = fileCard(meta, 'offer'); card.downloading(() => {}); }
          else bumpUnread(conv);
        }
        p.incoming = { fileId: m.fileId, meta: m, chunks: [], got: 0, card, conv, t0: Date.now() };
      } else if (m.t === 'fend' && p.incoming && p.incoming.fileId === m.fileId) {
        const inc = p.incoming; p.incoming = null;
        const blob = new Blob(inc.chunks, { type: inc.meta.mime || 'application/octet-stream' });
        recvBlobs.set(inc.fileId, blob);    // 暂存内存:切走再切回/未在看时都能看到"已保存"
        if (inc.card) inc.card.saved(blob); else bumpUnread(inc.conv);
      }
    } else if (p.incoming) {               // 文件二进制块
      p.incoming.chunks.push(ev.data);
      p.incoming.got += ev.data.byteLength;
      const inc = p.incoming;
      if (inc.card) inc.card.progress(inc.got, inc.meta.size, inc.got / ((Date.now() - inc.t0) / 1000 || 1));
    }
  };
}

/* 发送队列:每 peer 串行(文件流,尊重背压)。文件按 fileId 打标,支持并发拉取串行化 */
async function pump(p) {
  if (p.sending || !p.dc || p.dc.readyState !== 'open') return;
  const job = p.queue.shift();
  if (!job) return;
  p.sending = true;
  const t0 = Date.now(), size = job.file.size;
  try {
    p.dc.send(JSON.stringify({ t: 'fmeta', fileId: job.fileId, name: job.file.name,
                               size, mime: job.file.type }));
    let off = 0;
    while (off < size) {
      if (p.dc.bufferedAmount > HIGH_WATER) { await new Promise(ok => { p.dc.onbufferedamountlow = ok; }); continue; }
      const buf = await job.file.slice(off, off + CHUNK).arrayBuffer();
      p.dc.send(buf); off += buf.byteLength;
      if (job.card && job.card.sendProgress) job.card.sendProgress(off, size, off / ((Date.now() - t0) / 1000 || 1));
    }
    p.dc.send(JSON.stringify({ t: 'fend', fileId: job.fileId }));
    if (job.card && job.card.sent) job.card.sent();     // 私聊直推:发完显"已发送"
  } catch (e) { /* 传输失败:接收方会超时,发送方静默 */ }
  p.sending = false;
  pump(p);
}
// 按需建连并等 DataChannel open(拉取时对方可能还没直连上)
function ensurePeer(info) { if (!peers.has(info.id) && ws && ws.readyState === 1) addPeer(info, true); }
function waitDcOpen(id, ms) {
  return new Promise(res => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const p = peers.get(id);
      if (p && p.dc && p.dc.readyState === 'open') { clearInterval(iv); res(p); }
      else if (Date.now() - t0 > ms) { clearInterval(iv); res(null); }
    }, 150);
  });
}
async function streamFileTo(info, file, fileId, selfCard) {
  let p = peers.get(info.id);
  if (!p || !p.dc || p.dc.readyState !== 'open') { ensurePeer(info); p = await waitDcOpen(info.id, 12000); }
  if (!p) { if (selfCard) selfCard.unavailable(); return; }   // 建不起来:私聊卡显不可达
  p.queue.push({ file, fileId, card: selfCard }); pump(p);
}

/* ── 发送入口:群聊=全员,私聊=目标设备 ── */
function targets() { return [...peers.values()].filter(p => p.dc && p.dc.readyState === 'open'); }
function convTargets() {
  if (currentConv === 'all') return targets();
  const p = peers.get(currentConv);
  return p && p.dc && p.dc.readyState === 'open' ? [p] : [];
}
const convScope = () => currentConv === 'all' ? 'all' : 'dm';

/* ── gossip:群消息去重+洪泛(小消息才走,大文件不走) ── */
const seen = new Set(); let msgSeq = 0;
function newMid() { return myId + ':' + (++msgSeq); }
function markSeen(mid) { if (!mid || seen.has(mid)) return false; seen.add(mid); if (seen.size > 8000) seen.clear(); return true; }
function broadcastFrame(obj, exceptId) {   // 发给所有已连邻居(除来源),字符串帧
  const s = JSON.stringify(obj);
  for (const [id, p] of peers) if (id !== exceptId && p.dc && p.dc.readyState === 'open') { try { p.dc.send(s); } catch {} }
}

function sendText() {
  const text = txt.value.trim(); if (!text) return;
  txt.value = ''; txt.dispatchEvent(new Event('input'));
  const ts = Date.now();
  const rec = { conv: currentConv, type: 'text', from: myName, fromId: myId, kind: myKind, me: 1, text, ts };
  pushMsg(rec); addText(rec, true);
  if (currentConv === 'all') {
    const mid = newMid(); markSeen(mid);   // 群聊:洪泛给所有邻居,靠 gossip 扩散到全房
    broadcastFrame({ t: 'text', mid, fromId: myId, from: myName, fromKind: myKind, text, ts }, null);
  } else {                                  // 私聊:只发目标设备,不洪泛
    const p = peers.get(currentConv);
    if (p && p.dc && p.dc.readyState === 'open')
      p.dc.send(JSON.stringify({ t: 'dm', fromId: myId, from: myName, fromKind: myKind, text, ts }));
    else sysLine(t('no_direct', { name: p ? p.name : '' }));
  }
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

// 粘贴截图/文件:直接发到当前会话(截图=clipboardData.files 里的 image/*)
txt.addEventListener('paste', e => {
  const fs = e.clipboardData && e.clipboardData.files;
  if (fs && fs.length) { e.preventDefault(); [...fs].forEach(sendFile); }
});
// 拖文件到窗口任意处即发。浏览器默认会"打开文件=离开页面",必须全程 preventDefault 拦截
const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
let dragDepth = 0;
window.addEventListener('dragenter', e => { if (hasFiles(e)) { e.preventDefault(); if (dragDepth++ === 0) document.body.classList.add('dragging'); } });
window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('drop', e => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
  [...e.dataTransfer.files].forEach(sendFile);
});

/* ── 文件 ── */
// myFiles 是"在线目录"(catalog):我这台还在提供的文件。群聊文件带 group+mid,供新设备可达时补发
const myFiles = new Map();     // fileId -> {file, card, meta, group, mid}
const offerCards = new Map();  // fileId -> {card, meta, timer}  我收到的可拉取通告
const recvBlobs = new Map();   // fileId -> Blob  已收下的文件(仅内存,不入库,关页即丢)
// 这个文件我是否已知(历史/已渲染通告/已收下)——跨 reload、跨到达路径的按-fileId 幂等
function knownFile(fileId) {
  return offerCards.has(fileId) || recvBlobs.has(fileId) || msgs.some(x => x.type === 'file' && x.fileId === fileId);
}

// 群聊=贴通告(状态化,谁可达谁补收),文件留本机等人来拉;私聊=直推给对方那台(发了就到,不用点下载)
async function sendFile(file) {
  const conv = currentConv;                 // 捕获当前会话:'all'=群 / peerId=私聊
  const ts = Date.now();
  const fileId = 'f' + Math.random().toString(36).slice(2, 10);
  const thumb = isImg(file.name) ? await makeThumb(file).catch(() => null) : null;
  const meta = { fileId, name: file.name, size: file.size, mime: file.type, ts,
                 fromId: myId, from: myName, kind: myKind, thumb };
  const card = fileCard(meta, 'self');
  pushMsg({ conv, type: 'file', me: 1, ...meta });   // 历史归到当前会话
  if (conv === 'all') {                     // 群:发通告(=向所有可达设备同步我的目录)
    card.selfReceipt();
    const mid = newMid(); markSeen(mid);
    myFiles.set(fileId, { file, card, meta, group: true, mid });
    broadcastFrame({ t: 'offer', mid, ...meta }, null);
  } else {                                  // 私聊:直推,不等对方点下载
    const p = peers.get(conv);
    myFiles.set(fileId, { file, card, meta, group: false });
    if (p && p.dc && p.dc.readyState === 'open') {
      card.sending();
      streamFileTo({ id: conv, name: p.name, ua: p.ua }, file, fileId, card);
    } else { card.unavailable(); sysLine(t('no_direct', { name: p ? p.name : '' })); }
  }
}
// 目录同步:把本机还在提供的群聊通告定向补发给刚可达的一台设备(复用原 mid,老设备自动去重)
function advertiseCatalogTo(p) {
  if (!p || !p.dc || p.dc.readyState !== 'open') return;
  for (const info of myFiles.values())
    if (info.group) p.dc.send(JSON.stringify({ t: 'offer', mid: info.mid, ...info.meta }));
}
// 生成 ~360px JPEG 缩略图(几十 KB,可随通告 gossip);原图不动、仍按需拉
function makeThumb(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => {
      const s = Math.min(1, 360 / Math.max(im.width, im.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(im.width * s); cv.height = Math.round(im.height * s);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      try { res(cv.toDataURL('image/jpeg', 0.6)); } catch (e) { rej(e); }
    };
    im.onerror = rej; im.src = url;
  });
}

// 渲染"待下载"卡 + 绑下载动作
function renderOffer(meta) {
  const card = fileCard(meta, 'offer');
  const rec = { card, meta, timer: null };
  offerCards.set(meta.fileId, rec);
  card.offer(() => {
    card.downloading(() => {});                 // 进入下载中
    const pull = { t: 'pull', fileId: meta.fileId, toId: meta.fromId,
                   fromId: myId, from: myName, fromKind: myKind };
    const sp = peers.get(meta.fromId);
    if (sp && sp.dc && sp.dc.readyState === 'open') sp.dc.send(JSON.stringify(pull));
    else broadcastFrame({ ...pull, mid: newMid() }, null);   // 不直连发送方就 gossip 路由拉取请求
    rec.timer = setTimeout(() => card.unavailable(), 9000);  // 9s 无响应=发送方离线
  });
  return card;
}

/* ── 桌面边栏 ── */
const sideAvatar = document.getElementById('side-avatar');
if (sideAvatar) {
  sideAvatar.innerHTML = avatarSvg(myKind, true, myId, myColor());
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
