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

// rooms: ip -> Map<peerId, ws>
const rooms = new Map();

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

const wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
  const ip = roomKey(req);
  let room = rooms.get(ip);
  if (!room) { room = new Map(); rooms.set(ip, room); }
  let peerId = null;

  const peersInfo = () => [...room.entries()].map(([id, s]) => ({ id, name: s._name, ua: s._ua }));
  const sendTo = (id, obj) => { const s = room.get(id); if (s && s.readyState === 1) s.send(JSON.stringify(obj)); };
  const broadcast = (obj, exceptId) => {
    for (const [id, s] of room) if (id !== exceptId && s.readyState === 1) s.send(JSON.stringify(obj));
  };

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'hello') {
      // {type:hello, id, name, ua}
      peerId = String(m.id).slice(0, 40);
      ws._name = String(m.name || '设备').slice(0, 40);
      ws._ua = String(m.ua || '').slice(0, 20);
      // 同 id 重连:顶掉旧连接
      const old = room.get(peerId); if (old && old !== ws) try { old.close(); } catch {}
      room.set(peerId, ws);
      ws.send(JSON.stringify({ type: 'peers', you: peerId, room: roomCode(ip),
        peers: peersInfo().filter(p => p.id !== peerId) }));
      broadcast({ type: 'peer-joined', peer: { id: peerId, name: ws._name, ua: ws._ua } }, peerId);
    } else if (m.type === 'rename' && peerId) {
      ws._name = String(m.name || '').slice(0, 40) || ws._name;
      broadcast({ type: 'peer-renamed', id: peerId, name: ws._name }, peerId);
    } else if (m.type === 'signal' && peerId && m.to) {
      // WebRTC offer/answer/ice 中转 —— 服务器可见的唯一"内容"就是这几百字节握手
      sendTo(m.to, { type: 'signal', from: peerId, data: m.data });
    }
  });

  const bye = () => {
    if (peerId && room.get(peerId) === ws) {
      room.delete(peerId);
      broadcast({ type: 'peer-left', id: peerId });
      if (room.size === 0) rooms.delete(ip);
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
