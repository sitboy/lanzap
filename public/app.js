/* lan-transfer 前端:信令(ws) + WebRTC mesh + 分块文件直传 + 本地历史(IndexedDB)
 * 原则:服务器只递名片;文字/文件全部走 RTCDataChannel 点对点 */
'use strict';

const $ = id => document.getElementById(id);
const list = $('list'), peersBar = $('peers'), txt = $('txt'),
      send = $('send'), plus = $('plus'), fileInput = $('file');

/* ── i18n 渲染 ── */
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  txt.placeholder = t('input_placeholder');
  $('lang').textContent = LANG === 'zh' ? 'EN' : '中';
  document.title = t('app_title');
}
$('lang').onclick = () => { localStorage.lang = LANG === 'zh' ? 'en' : 'zh'; location.reload(); };

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
const myAvatar = /iPhone|iPad|Android/.test(navigator.userAgent) ? '📱' : '💻';
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
function saveMsg(m) { if (db) try { db.transaction('msgs', 'readwrite').objectStore('msgs').add(m); } catch {} }

/* ── UI 渲染 ── */
let lastTs = 0;
const fmtSize = n => n > 1048576 ? (n/1048576).toFixed(1)+' MB' : n > 1024 ? (n/1024).toFixed(1)+' KB' : n+' B';
const fmtTime = ts => { const d = new Date(ts), now = new Date();
  const hm = ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
  return d.toDateString() === now.toDateString() ? hm : (d.getMonth()+1)+'/'+d.getDate()+' '+hm; };
const isImg = n => /\.(png|jpe?g|gif|webp)$/i.test(n);
const fileIcon = n => /\.apk$/i.test(n) ? '🤖' : /\.(zip|rar|7z|gz)$/i.test(n) ? '🗜️'
  : /\.(mp4|mov|mkv)$/i.test(n) ? '🎬' : /\.(mp3|m4a|flac)$/i.test(n) ? '🎵'
  : /\.pdf$/i.test(n) ? '📕' : '📄';
const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

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
  row.innerHTML = `<div class="avatar">${mine ? myAvatar : '📱'}</div><div class="wrap">
    <div class="dev">${mine ? '' : esc(m.from)}</div><div class="bubble text"></div></div>`;
  row.querySelector('.bubble').textContent = m.text;
  list.appendChild(row); scrollBottom();
}

// 文件气泡(发送/接收共用,带进度与状态)
function addFileBubble(meta, mine) {
  timeDivider(meta.ts || Date.now());
  const row = document.createElement('div');
  row.className = 'row' + (mine ? ' me' : '');
  row.innerHTML = `<div class="avatar">${mine ? myAvatar : '📱'}</div><div class="wrap">
    <div class="dev">${mine ? '' : esc(meta.from || '')}</div>
    <div class="bubble file"><div class="fmain">
      <div class="finfo"><div class="fname"></div><div class="fsize">${fmtSize(meta.size)}</div></div>
      <div class="ficon">${fileIcon(meta.name)}</div></div>
      <div class="prog"><div></div></div>
      <div class="ffoot"><span class="fstat">${t(mine ? 'sending' : 'receiving')}</span><span class="fto"></span></div>
    </div></div>`;
  row.querySelector('.fname').textContent = meta.name;
  list.appendChild(row); scrollBottom();
  return {
    prog: p => { row.querySelector('.prog>div').style.width = (p*100).toFixed(1) + '%'; },
    done: blob => {
      row.querySelector('.prog').remove();
      row.querySelector('.fstat').textContent = t('sent');
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
          a.querySelector('.fstat').textContent = t('click_download');
          row.querySelector('.bubble.file').replaceWith(a);
        }
        if (nearBottom()) scrollBottom();
      }
    },
    fail: () => { row.querySelector('.prog>div').style.background = '#fa5151';
                  row.querySelector('.fstat').textContent = t('failed'); },
  };
}

/* ── 信令连接 ── */
let ws, peers = new Map(); // id -> {name, ua, pc, dc, sendQueue, recving}
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', id: myId, name: myName,
    ua: /iPhone|iPad|Android/.test(navigator.userAgent) ? 'mobile' : 'desktop' }));
  ws.onmessage = async e => {
    const m = JSON.parse(e.data);
    if (m.type === 'peers') {
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
               peers.delete(m.id); renderPeers(); }
    } else if (m.type === 'peer-renamed') {
      const p = peers.get(m.id); if (p) { p.name = m.name; renderPeers(); }
    } else if (m.type === 'signal') {
      handleSignal(m.from, m.data);
    }
  };
  ws.onclose = () => setTimeout(connect, 2000);
}

function renderPeers() {
  peersBar.innerHTML = `<div class="peer self"><div class="pa">${myAvatar}<div class="dot"></div></div>
    <div class="pn">${esc(myName)} (${t('me')})</div></div>`;
  for (const [id, p] of peers) {
    const el = document.createElement('div');
    el.className = 'peer';
    el.innerHTML = `<div class="pa">${p.ua === 'mobile' ? '📱' : '💻'}
      <div class="dot" style="background:${p.dc && p.dc.readyState === 'open' ? '#07c160' : '#f0ad4e'}"></div></div>
      <div class="pn">${esc(p.name)}</div>`;
    peersBar.appendChild(el);
  }
  if (peers.size === 0) {
    const e = document.createElement('div'); e.id = 'empty'; e.textContent = t('only_you');
    peersBar.appendChild(e);
  }
}

/* ── WebRTC mesh ── */
function addPeer(info, initiator) {
  if (peers.has(info.id)) return;
  const p = { name: info.name, ua: info.ua, pc: null, dc: null, queue: [], sending: false, recv: null };
  peers.set(info.id, p);
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
  dc.onopen = () => { renderPeers(); pump(p); };
  dc.onclose = () => { p.dc = null; renderPeers(); };
  dc.onmessage = ev => {
    if (typeof ev.data === 'string') {
      const m = JSON.parse(ev.data);
      if (m.t === 'text') {
        addText({ from: p.name, text: m.text, ts: m.ts }, false);
        saveMsg({ type: 'text', from: p.name, text: m.text, ts: m.ts });
      } else if (m.t === 'meta') {
        p.recv = { meta: { ...m, from: p.name }, chunks: [], got: 0,
                   ui: addFileBubble({ ...m, from: p.name }, false) };
      } else if (m.t === 'end' && p.recv) {
        const r = p.recv; p.recv = null;
        r.ui.done(new Blob(r.chunks, { type: r.meta.mime || 'application/octet-stream' }));
        saveMsg({ type: 'file', from: p.name, name: r.meta.name, size: r.meta.size, ts: r.meta.ts });
      }
    } else if (p.recv) {
      p.recv.chunks.push(ev.data);
      p.recv.got += ev.data.byteLength;
      p.recv.ui.prog(p.recv.got / p.recv.meta.size);
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
      p.dc.send(JSON.stringify({ t: 'text', text: job.text, ts: job.ts }));
    } else {
      p.dc.send(JSON.stringify({ t: 'meta', name: job.file.name, size: job.file.size,
                                 mime: job.file.type, ts: job.ts }));
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

/* ── 发送入口(发给房间内所有已连接设备) ── */
function targets() { return [...peers.values()].filter(p => p.dc && p.dc.readyState === 'open'); }

function sendText() {
  const text = txt.value.trim(); if (!text) return;
  txt.value = ''; txt.dispatchEvent(new Event('input'));
  const ts = Date.now();
  addText({ text, ts }, true);
  saveMsg({ type: 'text', from: myName, me: 1, text, ts });
  targets().forEach(p => { p.queue.push({ kind: 'text', text, ts }); pump(p); });
}
send.onclick = sendText;
txt.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); sendText(); }
});
txt.addEventListener('input', () => {
  send.classList.toggle('show', !!txt.value.trim());
  plus.style.display = txt.value.trim() ? 'none' : 'flex';
  txt.style.height = 'auto'; txt.style.height = Math.min(txt.scrollHeight, 110) + 'px';
});

plus.onclick = () => fileInput.click();
fileInput.onchange = () => { [...fileInput.files].forEach(sendFile); fileInput.value = ''; };
function sendFile(file) {
  const ts = Date.now(), tg = targets();
  const ui = addFileBubble({ name: file.name, size: file.size, ts }, true);
  saveMsg({ type: 'file', from: myName, me: 1, name: file.name, size: file.size, ts });
  if (!tg.length) { ui.fail(); sysLine(t('only_you')); return; }
  let doneCount = 0;
  tg.forEach(p => {
    p.queue.push({ kind: 'file', file, ts,
      onprog: r => ui.prog(r),
      ondone: () => { if (++doneCount === tg.length) ui.done(null); },
      onfail: () => ui.fail() });
    pump(p);
  });
}

/* ── 启动:渲染历史 → 连接 ── */
applyI18n();
dbReady.then(() => {
  if (!db) return connect();
  const rq = db.transaction('msgs').objectStore('msgs').getAll();
  rq.onsuccess = () => {
    (rq.result || []).slice(-200).forEach(m => {
      if (m.type === 'text') addText({ from: m.from, text: m.text, ts: m.ts }, !!m.me);
      else { const ui = addFileBubble({ from: m.from, name: m.name, size: m.size, ts: m.ts }, !!m.me);
             ui.done(null); }
    });
    const note = document.createElement('div'); note.className = 'sys';
    note.textContent = t('history_note'); list.appendChild(note);
    scrollBottom();
    connect();
  };
  rq.onerror = () => connect();
});
