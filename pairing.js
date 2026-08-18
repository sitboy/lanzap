// Pairing introducer used by server.js. Tests must drive these same functions
// via the live listen path, not a second copy of the policy.
'use strict';
const crypto = require('crypto');

const MAX_PAIRS_HELLO = 16;
const MAX_LIVE_EDGES = 4000;
const NONCE_TTL_MS = 5 * 60 * 1000;
const MAX_NONCES = 2000;
const RELAY_PER_MIN = 8;
const CLAIM_PER_MIN = 8;          // 错码/乱猜：每连接每分钟
const CLAIM_GLOBAL_PER_MIN = 60;  // 全站错码上限，防开一堆 ws 扫码空间
const NONCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function parsePairs(pairs) {
  if (!Array.isArray(pairs)) return [];
  const out = [];
  const seen = new Set();
  for (const rec of pairs) {
    if (!rec || typeof rec !== 'object') continue;
    const fp = String(rec.fp || '').slice(0, 40);
    const tok = String(rec.tok || '');
    if (!fp || !/^[A-Za-z0-9_-]{16,64}$/.test(tok)) continue;
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push({ fp, tok });
    if (out.length >= MAX_PAIRS_HELLO) break;
  }
  return out;
}

function pairTokOf(ws, otherFp) {
  const rec = (ws._pairs || []).find(p => p.fp === otherFp);
  return rec && rec.tok;
}

function canIntro(a, b) {
  if (!a || !b || !a._fp || !b._fp || a._fp === b._fp) return false;
  const ta = pairTokOf(a, b._fp), tb = pairTokOf(b, a._fp);
  return !!(ta && tb && ta === tb);
}

function sameRoom(a, b) {
  return !!(a._roomKey && a._roomKey === b._roomKey);
}

function edgeKey(idA, idB) {
  const x = String(idA), y = String(idB);
  return x < y ? x + '|' + y : y + '|' + x;
}

function mintNonce() {
  let s = '';
  for (let i = 0; i < 6; i++) s += NONCE_ALPHABET[crypto.randomInt(NONCE_ALPHABET.length)];
  return s;
}

function sendJson(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function createPairing({ iceConfig, pairingEnabled }) {
  const onlineByFp = new Map();
  const liveEdges = new Map();
  const pairNonces = new Map();
  const claimGrants = new Map(); // edgeKey -> true; claim is consent before tok exists
  const relayHits = new WeakMap();
  const claimHits = new WeakMap();
  let claimGlobal = { n: 0, t0: 0 };

  /* 限流拆两层,别让它反过来变成 DoS 放大器:
   *   每连接(claimConnOk) —— 任何 claim 都计。超了就是这条连接自己在乱猜,踢掉。
   *   全站(claimMissOk)   —— 只计错码。命中有效码的合法配对永不消耗全站配额,
   *                          否则攻击者拿 8 条连接打满 60 次,全站就都配不上对了
   *                          (实测过:合法用户拿正确的码来,被 pair-deny 还被踢下线)。
   * 全站超限只拒不踢:共享配额被别人耗尽不等于你有恶意,断线会让客户端 2s 重连后再撞一次。 */
  function claimConnOk(ws) {
    const now = Date.now();
    let h = claimHits.get(ws);
    if (!h || now - h.t0 > 60000) { h = { n: 0, t0: now }; claimHits.set(ws, h); }
    h.n++;
    return h.n <= CLAIM_PER_MIN;
  }

  function claimMissOk() {
    const now = Date.now();
    if (!claimGlobal.t0 || now - claimGlobal.t0 > 60000) claimGlobal = { n: 0, t0: now };
    claimGlobal.n++;
    return claimGlobal.n <= CLAIM_GLOBAL_PER_MIN;
  }

  function enabled() {
    return typeof pairingEnabled === 'function' ? pairingEnabled() : pairingEnabled !== false;
  }

  function indexOnline(ws) {
    if (!ws._fp) return;
    let set = onlineByFp.get(ws._fp);
    if (!set) { set = new Set(); onlineByFp.set(ws._fp, set); }
    set.add(ws);
  }

  function unindexOnline(ws) {
    if (!ws._fp) return;
    const set = onlineByFp.get(ws._fp);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) onlineByFp.delete(ws._fp);
  }

  function sweepNonces(now) {
    for (const [n, rec] of pairNonces)
      if (rec.exp <= now || !rec.ws || rec.ws.readyState !== 1) pairNonces.delete(n);
  }

  function sendPairIce(a, b, reason) {
    const ice = iceConfig(true);
    sendJson(a, { type: 'pair-ice', to: b._id, iceServers: ice, reason });
    sendJson(b, { type: 'pair-ice', to: a._id, iceServers: ice, reason });
  }

  function introPair(a, b) {
    if (!a || !b || !a._id || !b._id || a === b) return;
    const initiatorA = String(a._fp || a._id) < String(b._fp || b._id);
    const body = (from, to, init) => {
      const same = sameRoom(from, to);
      return {
        type: 'pair-intro',
        peer: { id: to._id, name: to._name, ua: to._ua, hue: to._hue, slot: to._slot, fp: to._fp },
        // 同房 intro 只续期/打标，不下发 TURN。红线：本网房拿不到 relay 是结构属性。
        iceServers: iceConfig(!same),
        initiator: init,
        sameRoom: same,
      };
    };

    if (sameRoom(a, b)) {
      sendJson(a, body(a, b, initiatorA));
      sendJson(b, body(b, a, !initiatorA));
      return;
    }

    const k = edgeKey(a._id, b._id);
    if (!liveEdges.has(k)) {
      if (liveEdges.size >= MAX_LIVE_EDGES) {
        sendJson(a, { type: 'pair-limit', why: 'edges' });
        sendJson(b, { type: 'pair-limit', why: 'edges' });
        return;
      }
      liveEdges.set(k, { a, b, turn: true });
    } else {
      const e = liveEdges.get(k); e.a = a; e.b = b;
    }
    sendJson(a, body(a, b, initiatorA));
    sendJson(b, body(b, a, !initiatorA));
  }

  function matchPairs(ws) {
    if (!enabled() || !ws._fp) return;
    for (const rec of ws._pairs || []) {
      const set = onlineByFp.get(rec.fp);
      if (!set) continue;
      for (const other of set) {
        if (other !== ws && canIntro(ws, other)) introPair(ws, other);
      }
    }
  }

  function onHelloAttached(ws) {
    if (!enabled()) return;
    indexOnline(ws);
    matchPairs(ws);
  }

  function routeSignal(fromId, to, data, room, sendToRoom) {
    if (room && room.has(to)) {
      sendToRoom(to, { type: 'signal', from: fromId, data });
      return true;
    }
    const edge = liveEdges.get(edgeKey(fromId, to));
    if (!edge) return false;
    const dest = edge.a._id === to ? edge.a : edge.b;
    if (dest && dest.readyState === 1) {
      dest.send(JSON.stringify({ type: 'signal', from: fromId, data }));
      return true;
    }
    return false;
  }

  function handleListen(ws) {
    if (!enabled()) return;
    for (const [n, rec] of pairNonces) if (rec.ws === ws) pairNonces.delete(n);
    sweepNonces(Date.now());
    if (pairNonces.size >= MAX_NONCES) {
      sendJson(ws, { type: 'pair-limit', why: 'nonces' });
      return;
    }
    let nonce;
    do { nonce = mintNonce(); } while (pairNonces.has(nonce));
    pairNonces.set(nonce, { ws, exp: Date.now() + NONCE_TTL_MS });
    sendJson(ws, { type: 'pair-nonce', nonce });
  }

  function handleClaim(ws, nonce) {
    if (!enabled()) { sendJson(ws, { type: 'pair-miss' }); return; }
    if (!claimConnOk(ws)) {
      sendJson(ws, { type: 'pair-deny', why: 'rate' });
      try { ws.close(1008, 'claim rate'); } catch {}
      return;
    }
    const n = String(nonce || '').toUpperCase();
    sweepNonces(Date.now());
    const rec = pairNonces.get(n);
    if (!rec || rec.ws === ws || rec.ws.readyState !== 1) {
      if (!claimMissOk()) { sendJson(ws, { type: 'pair-deny', why: 'rate' }); return; }
      sendJson(ws, { type: 'pair-miss' });
      return;
    }
    pairNonces.delete(n);
    claimGrants.set(edgeKey(rec.ws._id, ws._id), true);
    introPair(rec.ws, ws);
    /* 同房也要补中继,否则两人码在这个场景等于没用。
     * 场景:几台设备共用一个出口 IP(CGNAT / 手机热点 / 访客网),被 roomKey 判成同一本网房,
     * 但二层根本不通 —— host 候选被浏览器藏成 .local 且组播不转发,srflx 又卡在 NAT 发夹上,
     * 于是"看得见、连不上"。此时用户按诊断去扫两人码,同房分支不给 TURN,拿到的还是纯 STUN,
     * 扫完和没扫一模一样(实测过)。而"已配对"要靠 DC 上交换 tok 才成立,DC 又正是连不上的东西 = 死锁。
     * 红线守的是「没有用户明确动作就不给中继」,不是「同房就不给」:扫码/输码本身就是那个明确动作。
     * 自动重逢(matchPairs)触发的同房 intro 仍然只续期打标、不给 TURN,默认路径依旧拿不到 relay。 */
    if (sameRoom(rec.ws, ws)) {
      (rec.ws._pairTurnWith || (rec.ws._pairTurnWith = new Set())).add(ws._id);
      (ws._pairTurnWith || (ws._pairTurnWith = new Set())).add(rec.ws._id);
      sendPairIce(rec.ws, ws, 'relay');
    }
  }

  function rateOk(ws) {
    const now = Date.now();
    let h = relayHits.get(ws);
    if (!h || now - h.t0 > 60000) { h = { n: 0, t0: now }; relayHits.set(ws, h); }
    h.n++;
    return h.n <= RELAY_PER_MIN;
  }

  function findById(id, room) {
    if (room && room.has(id)) return room.get(id);
    for (const e of liveEdges.values()) {
      if (e.a._id === id) return e.a;
      if (e.b._id === id) return e.b;
    }
    for (const set of onlineByFp.values())
      for (const s of set) if (s._id === id) return s;
    return null;
  }

  function handleRelay(ws, to, room) {
    if (!enabled()) return false;
    const dest = findById(String(to || '').slice(0, 40), room);
    if (!dest || dest === ws || dest.readyState !== 1) return false;
    const ek = edgeKey(ws._id, dest._id);
    const hasEdge = liveEdges.has(ek);
    const granted = claimGrants.has(ek);
    if (!canIntro(ws, dest) && !hasEdge && !granted) {
      sendJson(ws, { type: 'pair-deny', why: 'no-auth' });
      return false;
    }
    if (!rateOk(ws)) {
      sendJson(ws, { type: 'pair-deny', why: 'rate' });
      return false;
    }
    (ws._pairTurnWith || (ws._pairTurnWith = new Set())).add(dest._id);
    (dest._pairTurnWith || (dest._pairTurnWith = new Set())).add(ws._id);
    sendPairIce(ws, dest, 'relay');
    return true;
  }

  function handleForget(ws, fp) {
    const target = String(fp || '').slice(0, 40);
    if (!target) return;
    const doomed = [];
    for (const [k, e] of liveEdges) {
      const other = e.a === ws ? e.b : e.b === ws ? e.a : null;
      if (!other || other._fp !== target) continue;
      doomed.push([k, other]);
    }
    for (const [k, other] of doomed) {
      liveEdges.delete(k);
      sendJson(other, { type: 'pair-gone', id: ws._id });
      sendJson(ws, { type: 'pair-gone', id: other._id });
    }
  }

  function bye(ws) {
    unindexOnline(ws);
    for (const [k, e] of [...liveEdges]) {
      if (e.a !== ws && e.b !== ws) continue;
      const other = e.a === ws ? e.b : e.a;
      sendJson(other, { type: 'pair-gone', id: ws._id });
      liveEdges.delete(k);
    }
    for (const [n, rec] of pairNonces) if (rec.ws === ws) pairNonces.delete(n);
    for (const k of [...claimGrants.keys()]) {
      const [x, y] = k.split('|');
      if (x === ws._id || y === ws._id) claimGrants.delete(k);
    }
  }

  function refreshPairIce(rooms) {
    if (!enabled()) return;
    const seen = new Set();
    for (const e of liveEdges.values()) {
      if (!e.a || !e.b) continue;
      const k = edgeKey(e.a._id, e.b._id);
      if (seen.has(k)) continue;
      seen.add(k);
      sendPairIce(e.a, e.b, 'refresh');
    }
    if (!rooms) return;
    for (const room of rooms.values()) {
      for (const s of room.values()) {
        if (!s._pairTurnWith) continue;
        for (const otherId of s._pairTurnWith) {
          const dest = findById(otherId, room);
          if (!dest) continue;
          const k = edgeKey(s._id, dest._id);
          if (seen.has(k)) continue;
          seen.add(k);
          sendPairIce(s, dest, 'refresh');
        }
      }
    }
  }

  return {
    parsePairs, canIntro, pairTokOf, sameRoom, edgeKey,
    introPair, matchPairs, onHelloAttached, routeSignal,
    handleListen, handleClaim, handleRelay, handleForget, bye,
    claimConnOk, claimMissOk,
    sendPairIce, refreshPairIce, findById,
    onlineByFp, liveEdges, pairNonces,
  };
}

module.exports = {
  parsePairs, canIntro, pairTokOf, sameRoom, edgeKey, mintNonce,
  createPairing, sendJson,
  MAX_PAIRS_HELLO, MAX_LIVE_EDGES, NONCE_TTL_MS, MAX_NONCES, RELAY_PER_MIN,
  CLAIM_PER_MIN, CLAIM_GLOBAL_PER_MIN,
};
