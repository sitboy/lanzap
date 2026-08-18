/* In-session transfer resume — same functions the page and the tests call. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZapResume = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CHUNK = 64 * 1024;
  const PARK_TTL_MS = 10 * 60 * 1000;
  const MAX_PARK = 8;

  function sweepPark(xferPark, now) {
    if (!xferPark || !xferPark.size) return 0;
    now = now == null ? Date.now() : now;
    let dropped = 0;
    for (const [id, park] of [...xferPark]) {
      const t0 = park.parkedAt || 0;
      if (t0 && now - t0 > PARK_TTL_MS) { xferPark.delete(id); dropped++; }
    }
    if (xferPark.size > MAX_PARK) {
      const aged = [...xferPark.entries()].sort((a, b) => (a[1].parkedAt || 0) - (b[1].parkedAt || 0));
      while (xferPark.size > MAX_PARK && aged.length) {
        const [id] = aged.shift();
        if (xferPark.delete(id)) dropped++;
      }
    }
    return dropped;
  }

  function fileSlicePlan(size, offset, chunk) {
    const c = chunk || CHUNK;
    const n = Number(size) || 0;
    const start = Math.max(0, Math.min(Number(offset) || 0, n));
    const ranges = [];
    for (let off = start; off < n; off += c) ranges.push({ start: off, end: Math.min(off + c, n) });
    return { offset: start, ranges };
  }

  function batchResumePlan(items, done, offset) {
    const list = items || [];
    const startIndex = Math.max(0, Math.min(Number(done) || 0, list.length));
    return {
      startIndex,
      firstOffset: startIndex < list.length ? Math.max(0, Number(offset) || 0) : 0,
      remaining: list.slice(startIndex),
    };
  }

  function clipChunks(chunks, targetBytes) {
    const want = Math.max(0, Number(targetBytes) || 0);
    const out = [];
    let got = 0;
    for (const c of chunks || []) {
      if (got >= want) break;
      const buf = c instanceof ArrayBuffer ? new Uint8Array(c)
        : (c && c.byteLength != null ? new Uint8Array(c.buffer || c, c.byteOffset || 0, c.byteLength) : c);
      const n = buf && buf.byteLength != null ? buf.byteLength : (buf ? buf.length : 0);
      const take = Math.min(n, want - got);
      if (take <= 0) continue;
      if (take === n) out.push(c);
      else out.push(buf.slice ? buf.slice(0, take) : buf);
      got += take;
    }
    return { chunks: out, got };
  }

  // Sender never resumes from its own incomplete marker. Channel open only
  // emits receiver rpos; the sender requeues when handleIncomingRpos sees it.
  function rposKey(msg) {
    if (!msg) return '';
    if (msg.batchId) return 'b:' + msg.batchId + ':' + (msg.done || 0) + ':' + (msg.offset || 0);
    return 'f:' + msg.fileId + ':' + (msg.offset || 0);
  }

  function flushResumeActions(xferPark, p) {
    const all = rposMessagesForPeer(xferPark, p);
    const rpos = [];
    for (const msg of all) {
      const id = msg.batchId || msg.fileId;
      const park = id && xferPark.get(id);
      const key = rposKey(msg);
      if (park && park.rposSentKey === key) continue;
      if (park) park.rposSentKey = key;
      rpos.push(msg);
    }
    return { rpos, requeue: [] };
  }

  function xferBusy(info) {
    return !!(info && (info.xferPhase === 'queued' || info.xferPhase === 'sending' || info.xferPhase === 'done'));
  }
  function markXferQueued(info) { if (info) info.xferPhase = 'queued'; }
  function markXferSending(info) { if (info) info.xferPhase = 'sending'; }
  function markXferDone(info) { if (info) info.xferPhase = 'done'; }
  function markXferIdle(info) { if (info) info.xferPhase = 'idle'; }

  function applyIncomingFmeta(fileId, fmetaOffset, park, alreadySaved, currentIncoming) {
    if (alreadySaved) return { action: 'ignore' };
    if (currentIncoming && currentIncoming.fileId === fileId)
      return { action: 'keep', chunks: currentIncoming.chunks, got: currentIncoming.got };
    if (park && park.kind === 'file') {
      const applied = applyFmetaOffset(park, fmetaOffset || 0);
      if (applied.ok) return { action: 'resume', chunks: park.chunks, got: park.got, clearPark: true };
      return { action: 'reset', chunks: [], got: 0, clearPark: true, reset: true };
    }
    return { action: 'fresh', chunks: [], got: 0 };
  }

  function sameBatchCur(st, m) {
    if (!st || !st.cur || !m) return false;
    if (m.fileId && st.cur.fileId) return st.cur.fileId === m.fileId;
    if (m.path != null && st.cur.path != null) return st.cur.path === m.path;
    return false;
  }

  // Decide how a batch fmeta interacts with an in-flight recv state.
  // continue = keep the live writer (do not skip, do not reset got).
  // next-file = previous cur is a different incomplete file → skip it.
  // reopen = no live writer, resume at offset (needs fileAt).
  // new-file = start this file from 0.
  function applyBatchFmeta(st, m) {
    const offset = Number(m && m.offset) || 0;
    if (sameBatchCur(st, m) && offset > 0) {
      if (st.cur.got === offset) return { action: 'continue', offset };
      if (Math.abs(st.cur.got - offset) <= CHUNK) {
        st.cur.got = Math.min(st.cur.got, offset);
        return { action: 'continue', offset: st.cur.got };
      }
      return { action: 'reset-file', offset: 0 };
    }
    if (st.cur && !sameBatchCur(st, m)) return { action: 'next-file', offset };
    if (!st.cur && offset > 0) return { action: 'reopen', offset };
    return { action: 'new-file', offset: 0 };
  }

  async function applyBatchFmetaAndOpen(st, m, openers) {
    openers = openers || {};
    const d = applyBatchFmeta(st, m);
    if (d.action === 'continue') return d;
    if (d.action === 'next-file' && st.cur) {
      try { if (st.cur.w && st.cur.w.close) await st.cur.w.close(); } catch {}
      st.cur = null;
      st.skipped = (st.skipped || 0) + 1;
    }
    if (d.action === 'reset-file' && st.cur) {
      try { if (st.cur.w && st.cur.w.close) await st.cur.w.close(); } catch {}
      st.cur = null;
    }
    let offset = d.offset || 0;
    let w;
    if (offset > 0 && typeof openers.fileAt === 'function') {
      w = await openers.fileAt(m, offset);
    } else {
      if (offset > 0) offset = 0;
      w = await openers.file(m);
    }
    st.cur = { w, size: (m && m.size) || 0, got: offset, fileId: m && m.fileId, path: m && m.path };
    return Object.assign({}, d, { offset, opened: true });
  }

  function positionalWriter(writeAt, close, startPos) {
    let pos = startPos || 0;
    return {
      write(c) {
        const u8 = c instanceof Uint8Array ? c : new Uint8Array(c);
        const r = writeAt(pos, u8);
        pos += u8.byteLength;
        return r;
      },
      close,
      position: () => pos,
    };
  }

  function applyFmetaOffset(park, fmetaOffset) {
    if (!park || park.kind !== 'file') return { ok: false, reset: true, park: null };
    const claimed = Number(fmetaOffset);
    if (!Number.isFinite(claimed) || claimed < 0) return { ok: false, reset: true, park: null };
    if (park.got === claimed) return { ok: true, reset: false, park };
    if (Math.abs(park.got - claimed) > CHUNK) return { ok: false, reset: true, park: null };
    const use = Math.min(park.got, claimed);
    const clipped = clipChunks(park.chunks, use);
    park.chunks = clipped.chunks;
    park.got = clipped.got;
    return { ok: true, reset: false, park };
  }

  function parkIncoming(xferPark, p, incoming) {
    if (!xferPark || !p || !p.fp || !incoming || !incoming.fileId) return;
    xferPark.set(incoming.fileId, {
      kind: 'file',
      got: incoming.got || 0,
      chunks: incoming.chunks || [],
      meta: incoming.meta,
      conv: incoming.conv,
      fromFp: p.fp,
      parkedAt: Date.now(),
    });
    sweepPark(xferPark);
  }

  function parkBatch(xferPark, p, batchId, st) {
    if (!xferPark || !p || !p.fp || !batchId || !st) return;
    xferPark.set(batchId, { kind: 'batch', st, fromFp: p.fp, parkedAt: Date.now() });
    sweepPark(xferPark);
  }

  function parkTransfersForPeer(xferPark, p, recvBatches) {
    if (!p) return;
    if (p.incoming) parkIncoming(xferPark, p, p.incoming);
    if (p.binc && recvBatches && recvBatches.get) parkBatch(xferPark, p, p.binc, recvBatches.get(p.binc));
  }

  function rposMessagesForPeer(xferPark, p) {
    if (!xferPark || !p || !p.fp) return [];
    const out = [];
    for (const [id, park] of xferPark) {
      if (park.fromFp !== p.fp) continue;
      if (park.kind === 'file') {
        out.push({ t: 'rpos', fileId: id, offset: park.got || 0 });
      } else {
        const st = park.st || {};
        const done = st.done || 0;
        out.push({
          t: 'rpos',
          batchId: id,
          done,
          fileId: st.meta && st.meta.batchId != null ? st.meta.batchId + '_' + done : undefined,
          offset: st.cur ? (st.cur.got || 0) : 0,
        });
      }
    }
    return out;
  }

  function handleIncomingRpos(m, myFiles, myBatches) {
    if (!m || m.t !== 'rpos') return { kind: 'ignore' };
    if (m.batchId) {
      const b = myBatches && myBatches.get(m.batchId);
      if (!b) return { kind: 'ignore' };
      if (!b.items) return { kind: 'gone', gone: { t: 'gone', batchId: m.batchId } };
      if (xferBusy(b)) return { kind: 'ignore' };
      b.incomplete = null;
      markXferQueued(b);
      return {
        kind: 'requeue',
        job: {
          batch: b, batchId: m.batchId, card: b.card,
          done: Number(m.done) || 0, offset: Number(m.offset) || 0,
        },
      };
    }
    if (m.fileId) {
      const info = myFiles && myFiles.get(m.fileId);
      if (!info) return { kind: 'ignore' };
      if (!info.file) return { kind: 'gone', gone: { t: 'gone', fileId: m.fileId } };
      const size = info.file.size;
      const off = Number(m.offset);
      if (!Number.isFinite(off) || off < 0 || off > size) return { kind: 'ignore' };
      if (xferBusy(info)) return { kind: 'ignore' };
      info.incomplete = null;
      markXferQueued(info);
      return {
        kind: 'requeue',
        job: { file: info.file, fileId: m.fileId, card: info.card, offset: off },
      };
    }
    return { kind: 'ignore' };
  }

  function markIncomplete(info, offset, done, toFp) {
    if (!info || !toFp) return;
    info.incomplete = { offset: offset || 0, done: done || 0, toFp };
  }

  function requeueIncomplete(myFiles, myBatches, p) {
    if (!p || !p.fp) return [];
    const jobs = [];
    if (myFiles) for (const info of myFiles.values()) {
      if (info.incomplete && info.incomplete.toFp === p.fp && info.file) {
        jobs.push({
          file: info.file,
          fileId: info.meta ? info.meta.fileId : info.fileId,
          card: info.card,
          offset: info.incomplete.offset || 0,
          toFp: p.fp,
        });
        info.incomplete = null;
      }
    }
    if (myBatches) for (const b of myBatches.values()) {
      if (b.incomplete && b.incomplete.toFp === p.fp && b.items) {
        jobs.push({
          batch: b,
          batchId: b.meta ? b.meta.batchId : b.batchId,
          card: b.card,
          done: b.incomplete.done || 0,
          offset: b.incomplete.offset || 0,
          toFp: p.fp,
        });
        b.incomplete = null;
      }
    }
    return jobs;
  }

  function applyGoneToPark(xferPark, m, fromFp) {
    if (!xferPark || !m) return false;
    const id = m.fileId || m.batchId;
    const park = xferPark.get(id);
    if (!park || (fromFp && park.fromFp !== fromFp)) return false;
    xferPark.delete(id);
    return true;
  }

  return {
    CHUNK, PARK_TTL_MS, MAX_PARK, sweepPark,
    fileSlicePlan,
    batchResumePlan,
    clipChunks,
    applyFmetaOffset,
    applyIncomingFmeta,
    flushResumeActions,
    rposKey,
    markXferQueued, markXferSending, markXferDone, markXferIdle, xferBusy,
    applyBatchFmeta,
    applyBatchFmetaAndOpen,
    positionalWriter,
    parkIncoming,
    parkBatch,
    parkTransfersForPeer,
    rposMessagesForPeer,
    handleIncomingRpos,
    markIncomplete,
    requeueIncomplete,
    applyGoneToPark,
  };
});
