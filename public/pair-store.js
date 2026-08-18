/* Client pairing list — localStorage shape used by the page and tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZapPairs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TTL = 30 * 24 * 3600 * 1000;
  const MAX = 16;
  const TOK_RE = /^[A-Za-z0-9_-]{16,64}$/;

  function loadPaired(raw, now) {
    now = now == null ? Date.now() : now;
    let arr;
    try { arr = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return []; }
    if (!Array.isArray(arr)) return [];
    return arr.filter(r => r && r.fp && TOK_RE.test(String(r.tok || '')) && (now - (r.lastSeen || 0) <= TTL));
  }

  function rememberPair(list, rec, now) {
    now = now == null ? Date.now() : now;
    const next = (list || []).filter(r => r.fp !== rec.fp);
    next.push({
      fp: rec.fp,
      tok: rec.tok,
      name: rec.name || '',
      ua: rec.ua || '',
      lastSeen: now,
      origin: rec.origin || 'qr',
    });
    next.sort((a, b) => (a.lastSeen || 0) - (b.lastSeen || 0));
    while (next.length > MAX) next.shift();
    return next;
  }

  function forgetPair(list, fp) { return (list || []).filter(r => r.fp !== fp); }
  function isPaired(list, fp) { return !!fp && (list || []).some(r => r.fp === fp); }
  function pairsForHello(list) { return (list || []).map(r => ({ fp: r.fp, tok: r.tok })); }

  function makeTok() {
    const b = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
    else require('crypto').randomFillSync(b);
    let bin = '';
    for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    const b64 = (typeof btoa === 'function') ? btoa(bin) : Buffer.from(b).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function pickTok(a, b) {
    if (a && !b) return a;
    if (b && !a) return b;
    if (a && b) return a < b ? a : b;
    return null;
  }

  return { TTL, MAX, TOK_RE, loadPaired, rememberPair, forgetPair, isPaired, pairsForHello, makeTok, pickTok };
});
