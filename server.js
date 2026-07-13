// lan-transfer 信令服务:唯一职责是"介绍人"——按出口 IP 把设备分进同一房间,
// 转发 WebRTC 握手信令(几百字节)。文字、文件全部走设备间 P2P,本服务零内容、零存储。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8879;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const fp = path.join(PUB, path.normalize(p));
  if (!fp.startsWith(PUB) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    res.writeHead(404); return res.end();
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

// rooms: key -> Map<peerId, ws>
const rooms = new Map();
// DoS 护栏:信令都是小 JSON,房间是局域网规模;超限直接拒绝,防内存被灌爆
const MAX_ROOMS = 5000;       // 全局房间数上限
const MAX_PER_ROOM = 50;      // 单房设备数上限(局域网远达不到)
const MAX_MSG = 256 * 1024;   // 单条信令上限(WebRTC SDP 通常 <10KB)

function clientIp(req) {
  // X-Real-IP 由 nginx 注入(不可伪造);退 XFF 首段;再退 socket
  const real = req.headers['x-real-ip'];
  const xff = req.headers['x-forwarded-for'];
  return (real || (xff ? xff.split(',')[0].trim() : '') || req.socket.remoteAddress) || 'unknown';
}

// 分房键:IPv4 用整地址;IPv6 用 /64 前缀——同一局域网各设备的 v6 地址不同但共享前缀,
// 逐台比对整地址会把同网设备拆散(经典坑)
function roomKey(req) {
  let ip = clientIp(req);
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip.includes(':')) return ip.split(':').slice(0, 4).join(':');
  return ip;
}

// 房间短码:给用户自诊用(两台设备对一下码,不同=出口不同)
function roomCode(key) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(36).slice(-4).toUpperCase();
}

const wss = new WebSocketServer({ server, maxPayload: MAX_MSG });
wss.on('connection', (ws, req) => {
  const autoKey = roomKey(req);
  let room = null, key = null, peerId = null;

  const peersInfo = () => [...room.entries()].map(([id, s]) => ({ id, name: s._name, ua: s._ua, hue: s._hue, slot: s._slot, fp: s._fp }));
  // 头像调色板槽位:给每台设备分房内最小空闲槽(离开即腾出、复用),客户端据此取精选色,不撞色也不乱
  const pickSlot = () => { const used = new Set(); for (const s of room.values()) if (s._slot != null) used.add(s._slot);
                           let i = 0; while (used.has(i)) i++; return i; };
  const sendTo = (id, obj) => { const s = room.get(id); if (s && s.readyState === 1) s.send(JSON.stringify(obj)); };
  const broadcast = (obj, exceptId) => {
    if (!room) return;
    for (const [id, s] of room) if (id !== exceptId && s.readyState === 1) s.send(JSON.stringify(obj));
  };

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'hello') {
      // {type:hello, id, name, ua, room?} —— room=手动组队码(扫码/链接),覆盖出口 IP 自动分组
      const manual = typeof m.room === 'string' && /^[A-Z0-9]{4,8}$/.test(m.room);
      // lan = 客户端读到本地子网派生的键(尽力而为):代理设备同子网可借此自动重聚,不受出口 IP 影响
      const lan = typeof m.lan === 'string' && /^[a-z0-9]{3,16}$/.test(m.lan);
      key = manual ? 'code:' + m.room : (lan ? 'lan:' + m.lan : autoKey);
      room = rooms.get(key);
      if (!room) {
        if (rooms.size >= MAX_ROOMS) { ws.close(1013, 'server busy'); return; }
        room = new Map(); rooms.set(key, room);
      }
      // 满员且不是已在房的重连 → 拒绝(重连由下方同 id 顶替处理)
      if (room.size >= MAX_PER_ROOM && !room.has(String(m.id).slice(0, 40))) {
        ws.close(1013, 'room full'); return;
      }
      peerId = String(m.id).slice(0, 40);
      ws._name = String(m.name || '设备').slice(0, 40);
      ws._ua = String(m.ua || '').slice(0, 20);
      ws._hue = (typeof m.hue === 'number' && m.hue >= 0 && m.hue < 360) ? m.hue : undefined;
      ws._fp = String(m.fp || '').slice(0, 40) || undefined;   // 持久设备指纹:客户端 localStorage 稳定值,用于收藏/信任(仅中转)
      // 同 id 重连:顶掉旧连接,并沿用它原来的槽位(颜色不变);新设备取最小空闲槽
      const old = room.get(peerId);
      ws._slot = (old && old._slot != null) ? old._slot : pickSlot();
      if (old && old !== ws) try { old.close(); } catch {}
      room.set(peerId, ws);
      // 诊断(按需):看每台设备真实呈现的出口/房间键,定位"同网却分家"的真因。LANZAP_DEBUG=1 才开
      if (process.env.LANZAP_DEBUG)
        console.log(`[room] ${new Date().toISOString()} ip=${clientIp(req)} key=${key} room#=${room.size} ua=${ws._ua} name=${ws._name}`);
      ws.send(JSON.stringify({ type: 'peers', you: peerId, slot: ws._slot,
        room: manual ? m.room : roomCode(key), manual,
        peers: peersInfo().filter(p => p.id !== peerId) }));
      broadcast({ type: 'peer-joined', peer: { id: peerId, name: ws._name, ua: ws._ua, hue: ws._hue, slot: ws._slot, fp: ws._fp } }, peerId);
    } else if (m.type === 'rename' && peerId) {
      ws._name = String(m.name || '').slice(0, 40) || ws._name;
      if (typeof m.hue === 'number' && m.hue >= 0 && m.hue < 360) ws._hue = m.hue;
      broadcast({ type: 'peer-renamed', id: peerId, name: ws._name, hue: ws._hue }, peerId);
    } else if (m.type === 'signal' && peerId && m.to) {
      // WebRTC offer/answer/ice 中转 —— 服务器可见的唯一"内容"就是这几百字节握手
      sendTo(m.to, { type: 'signal', from: peerId, data: m.data });
    }
  });

  const bye = () => {
    if (room && peerId && room.get(peerId) === ws) {
      room.delete(peerId);
      broadcast({ type: 'peer-left', id: peerId });
      if (room.size === 0) rooms.delete(key);
    }
  };
  ws.on('close', bye);
  ws.on('error', bye);
});

// 心跳:清理僵尸连接
setInterval(() => {
  for (const room of rooms.values())
    for (const s of room.values()) {
      if (s._dead) { try { s.terminate(); } catch {} continue; }
      s._dead = true; s.ping(() => {});
      s.once('pong', () => { s._dead = false; });
    }
}, 30000);

server.listen(PORT, () => console.log(`lan-transfer signaling on :${PORT}`));
