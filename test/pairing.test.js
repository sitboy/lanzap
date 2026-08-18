'use strict';
const assert = require('assert');
const http = require('http');
const WebSocket = require('ws');

process.env.TURN_HOST = process.env.TURN_HOST || 'turn.test.example';
process.env.TURN_SECRET = process.env.TURN_SECRET || 'test-secret';
delete process.env.ZAP_PAIRING;

const { startServer, iceConfig } = require('../server');

function onceMsg(ws, pred, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { ws.off('message', onMsg); reject(new Error('timeout waiting for message')); }, ms || 2000);
    function onMsg(raw) {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (pred(m)) { clearTimeout(t); ws.off('message', onMsg); resolve(m); }
    }
    ws.on('message', onMsg);
  });
}

function collect(ws, pred, ms) {
  return new Promise(resolve => {
    const hit = [];
    const t = setTimeout(() => { ws.off('message', onMsg); resolve(hit); }, ms);
    function onMsg(raw) {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!pred || pred(m)) hit.push(m);
    }
    ws.on('message', onMsg);
  });
}

function openClient(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function hello(ws, fields) {
  ws.send(JSON.stringify(Object.assign({
    type: 'hello', id: fields.id, name: fields.name || fields.id,
    ua: 'desktop', fp: fields.fp,
  }, fields.room ? { room: fields.room } : {}, fields.pairs ? { pairs: fields.pairs } : {})));
  return onceMsg(ws, m => m.type === 'peers');
}

function hasTurnUrl(iceServers) {
  return (iceServers || []).some(s => /turn:/i.test(String(s.urls)));
}

async function run() {
  const { server, port } = await startServer(0);
  const TOK = 'tokAAAAAAAAAAAAAAAAAAAA'; // 22 chars, valid
  const TOK2 = 'tokBBBBBBBBBBBBBBBBBBBB';

  // 1. matching tokens, two rooms → both get pair-intro; signal crosses
  {
    const a = await openClient(port);
    const b = await openClient(port);
    const introA = onceMsg(a, m => m.type === 'pair-intro');
    const introB = onceMsg(b, m => m.type === 'pair-intro');
    await hello(a, { id: 'dA1', fp: 'fA1', room: 'ROOM1A', pairs: [{ fp: 'fB1', tok: TOK }] });
    await hello(b, { id: 'dB1', fp: 'fB1', room: 'ROOM1B', pairs: [{ fp: 'fA1', tok: TOK }] });
    const ia = await introA, ib = await introB;
    assert.strictEqual(ia.peer.id, 'dB1');
    assert.strictEqual(ib.peer.id, 'dA1');
    assert.strictEqual(ia.sameRoom, false);
    assert.ok(hasTurnUrl(ia.iceServers), 'pair-intro must include turn: when TURN_HOST is set');
    assert.ok(hasTurnUrl(ib.iceServers), 'pair-intro must include turn:');
    const got = onceMsg(b, m => m.type === 'signal' && m.from === 'dA1');
    a.send(JSON.stringify({ type: 'signal', to: 'dB1', data: { ping: 1 } }));
    const sig = await got;
    assert.deepStrictEqual(sig.data, { ping: 1 });
    a.close(); b.close();
  }

  // 2. mismatched token → no intro
  {
    const a = await openClient(port);
    const b = await openClient(port);
    hello(a, { id: 'dA2', fp: 'fA2', room: 'ROOM2A', pairs: [{ fp: 'fB2', tok: TOK }] });
    hello(b, { id: 'dB2', fp: 'fB2', room: 'ROOM2B', pairs: [{ fp: 'fA2', tok: TOK2 }] });
    const extras = await collect(a, m => m.type === 'pair-intro', 400);
    assert.strictEqual(extras.length, 0, 'mismatched tok must not intro');
    a.close(); b.close();
  }

  // 3. missing token → no intro
  {
    const a = await openClient(port);
    const b = await openClient(port);
    hello(a, { id: 'dA3', fp: 'fA3', room: 'ROOM3A', pairs: [{ fp: 'fB3', tok: TOK }] });
    hello(b, { id: 'dB3', fp: 'fB3', room: 'ROOM3B' });
    const extras = await collect(a, m => m.type === 'pair-intro', 400);
    assert.strictEqual(extras.length, 0, 'missing tok must not intro');
    a.close(); b.close();
  }

  // 4. auto-LAN hello (no room code) iceServers has no turn:
  {
    const a = await openClient(port);
    const peers = await hello(a, { id: 'dLAN', fp: 'fLAN' });
    assert.strictEqual(peers.manual, false);
    assert.ok(!hasTurnUrl(peers.iceServers), 'auto-LAN peers.iceServers must not contain turn:');
    const direct = iceConfig(false);
    assert.ok(!hasTurnUrl(direct), 'iceConfig(false) must be STUN-only');
    a.close();
  }

  // 5. pair-relay without token/live-edge is rejected
  {
    const a = await openClient(port);
    const b = await openClient(port);
    await hello(a, { id: 'dA5', fp: 'fA5', room: 'ROOM5X' });
    await hello(b, { id: 'dB5', fp: 'fB5', room: 'ROOM5X' });
    const denied = onceMsg(a, m => m.type === 'pair-deny' || m.type === 'pair-ice');
    a.send(JSON.stringify({ type: 'pair-relay', to: 'dB5' }));
    const m = await denied;
    assert.strictEqual(m.type, 'pair-deny', 'roommate without tok/edge cannot mint TURN');
    a.close(); b.close();
  }

  // 6. listen/claim nonce completes
  {
    const a = await openClient(port);
    const b = await openClient(port);
    await hello(a, { id: 'dA6', fp: 'fA6', room: 'ROOM6A' });
    await hello(b, { id: 'dB6', fp: 'fB6', room: 'ROOM6B' });
    const nonceP = onceMsg(a, m => m.type === 'pair-nonce');
    a.send(JSON.stringify({ type: 'pair-listen' }));
    const nonceMsg = await nonceP;
    assert.ok(/^[A-Z0-9]{6}$/.test(nonceMsg.nonce));
    const introA = onceMsg(a, m => m.type === 'pair-intro');
    const introB = onceMsg(b, m => m.type === 'pair-intro');
    b.send(JSON.stringify({ type: 'pair-claim', nonce: nonceMsg.nonce }));
    const ia = await introA, ib = await introB;
    assert.strictEqual(ia.peer.id, 'dB6');
    assert.strictEqual(ib.peer.id, 'dA6');
    // already-paired (now have live edge) can request relay
    const iceA = onceMsg(a, m => m.type === 'pair-ice');
    const iceB = onceMsg(b, m => m.type === 'pair-ice');
    a.send(JSON.stringify({ type: 'pair-relay', to: 'dB6' }));
    const ra = await iceA, rb = await iceB;
    assert.strictEqual(ra.reason, 'relay');
    assert.strictEqual(rb.reason, 'relay');
    assert.strictEqual(ra.to, 'dB6');
    assert.strictEqual(rb.to, 'dA6');
    assert.ok(hasTurnUrl(ra.iceServers));
    a.close(); b.close();
  }

  // 7. same-room pair-intro must be STUN-only (red line)
  {
    const a = await openClient(port);
    const b = await openClient(port);
    const introA = onceMsg(a, m => m.type === 'pair-intro');
    const introB = onceMsg(b, m => m.type === 'pair-intro');
    await hello(a, { id: 'dA7', fp: 'fA7', pairs: [{ fp: 'fB7', tok: TOK }] });
    const peersA = await hello(b, { id: 'dB7', fp: 'fB7', pairs: [{ fp: 'fA7', tok: TOK }] });
    assert.ok(!hasTurnUrl(peersA.iceServers), 'auto-LAN peers still STUN-only');
    const ia = await introA;
    await introB;
    assert.strictEqual(ia.sameRoom, true);
    assert.ok(!hasTurnUrl(ia.iceServers), 'sameRoom pair-intro must not include turn:');
    a.close(); b.close();
  }

  // 8. pair-claim brute force is rate-limited
  {
    const a = await openClient(port);
    await hello(a, { id: 'dA8', fp: 'fA8' });
    let deny = 0, miss = 0;
    const done = new Promise(resolve => {
      a.on('message', raw => {
        const m = JSON.parse(raw);
        if (m.type === 'pair-miss') miss++;
        if (m.type === 'pair-deny') { deny++; resolve(); }
      });
      a.on('close', () => resolve());
    });
    for (let i = 0; i < 20; i++)
      a.send(JSON.stringify({ type: 'pair-claim', nonce: 'ZZZZ' + String(i).slice(-2) }));
    await Promise.race([done, new Promise(r => setTimeout(r, 1500))]);
    assert.ok(deny >= 1 || a.readyState > 1, 'claim flood must deny or drop the socket');
    assert.ok(miss + deny <= 12, 'must not answer every guess: miss+deny=' + (miss + deny));
    try { a.close(); } catch {}
  }

  // 限流不得反成 DoS 放大器:攻击者打满全站错码配额后,
  // 拿着正确的码来的合法用户必须照常配上,且不能被踢下线。
  {
    const floods = [];
    for (let i = 0; i < 8; i++) {
      const w = await openClient(port);
      await hello(w, { id: 'dF' + i, fp: 'fF' + i });
      floods.push(w);
    }
    for (const w of floods)
      for (let j = 0; j < 8; j++)
        w.send(JSON.stringify({ type: 'pair-claim', nonce: 'QQQQ' + String(j).slice(-2) }));
    await new Promise(r => setTimeout(r, 300));

    const host = await openClient(port);
    await hello(host, { id: 'dA9', fp: 'fA9' });
    host.send(JSON.stringify({ type: 'pair-listen' }));
    const nm = await onceMsg(host, m => m.type === 'pair-nonce', 1500);
    const guest = await openClient(port);
    await hello(guest, { id: 'dB9', fp: 'fB9' });
    const introP = onceMsg(guest, m => m.type === 'pair-intro', 1500);
    guest.send(JSON.stringify({ type: 'pair-claim', nonce: nm.nonce }));
    const intro = await introP;
    assert.strictEqual(intro.peer.id, 'dA9', 'legit claim must succeed while global quota is exhausted');
    assert.ok(guest.readyState === 1, 'legit claimer must not be dropped by someone else flooding');
    for (const w of floods) try { w.close(); } catch {}
    try { host.close(); guest.close(); } catch {}
  }

  // 同房但二层不通(CGNAT/热点/AP 隔离)时,两人码必须真的解决问题:
  // 扫码=显式动作,这一对要拿到中继。而没扫码的自动重逢仍然只给 STUN。
  {
    const host = await openClient(port);
    await hello(host, { id: 'dA10', fp: 'fA10' });
    const guest = await openClient(port);
    await hello(guest, { id: 'dB10', fp: 'fB10' });

    host.send(JSON.stringify({ type: 'pair-listen' }));
    const nm = await onceMsg(host, m => m.type === 'pair-nonce', 1500);

    const hostIce = onceMsg(host, m => m.type === 'pair-ice', 2000);
    const guestIce = onceMsg(guest, m => m.type === 'pair-ice', 2000);
    const intro = onceMsg(guest, m => m.type === 'pair-intro', 2000);
    guest.send(JSON.stringify({ type: 'pair-claim', nonce: nm.nonce }));

    const gi = await intro;
    assert.strictEqual(gi.sameRoom, true, 'same egress IP must land in the same room');
    assert.ok(!hasTurnUrl(gi.iceServers), 'sameRoom pair-intro itself still must not carry turn:');

    const hIce = await hostIce, gIce = await guestIce;
    assert.strictEqual(hIce.reason, 'relay');
    assert.strictEqual(gIce.reason, 'relay');
    assert.ok(hasTurnUrl(hIce.iceServers), 'scanned pair must get a relay even in the same room');
    assert.ok(hasTurnUrl(gIce.iceServers), 'scanned pair must get a relay even in the same room');
    try { host.close(); guest.close(); } catch {}
  }

  // 反面:同房自动重逢(已配对,双方带 tok,没有任何扫码动作)绝不能拿到中继。
  {
    const TOK = 'AutoReunionTok0123456';
    const x = await openClient(port);
    await hello(x, { id: 'dA11', fp: 'fA11', pairs: [{ fp: 'fB11', tok: TOK }] });
    const y = await openClient(port);
    const yIntro = onceMsg(y, m => m.type === 'pair-intro', 2000);
    const yIce = collect(y, m => m.type === 'pair-ice', 700);
    await hello(y, { id: 'dB11', fp: 'fB11', pairs: [{ fp: 'fA11', tok: TOK }] });
    const yi = await yIntro;
    assert.strictEqual(yi.sameRoom, true);
    assert.ok(!hasTurnUrl(yi.iceServers), 'auto reunion in the auto-LAN room must stay STUN-only');
    assert.strictEqual((await yIce).length, 0, 'auto reunion must not trigger a relay pair-ice');
    try { x.close(); y.close(); } catch {}
  }

  await new Promise((res, rej) => server.close(err => err ? rej(err) : res()));
  console.log('pairing.test.js ok');
}

run().catch(err => { console.error(err); process.exit(1); });
