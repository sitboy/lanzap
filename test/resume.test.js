'use strict';
const assert = require('assert');
const resume = require('../public/resume.js');

function buf(n, fill) {
  const a = new Uint8Array(n);
  if (fill != null) a.fill(fill);
  return a.buffer;
}

async function run() {
  // mid-file offset plan — same function pumpFile uses
  {
    const size = 300000;
    const off = 128 * 1024;
    const plan = resume.fileSlicePlan(size, off, resume.CHUNK);
    assert.strictEqual(plan.offset, off);
    assert.ok(plan.ranges.length > 0);
    assert.strictEqual(plan.ranges[0].start, off);
    assert.strictEqual(plan.ranges[plan.ranges.length - 1].end, size);
    const bytes = plan.ranges.reduce((s, r) => s + (r.end - r.start), 0);
    assert.strictEqual(bytes, size - off);
  }

  // folder: resume after a file boundary (done=2) plus mid-file offset
  {
    const items = [
      { fileId: 'b_0', file: { size: 10 } },
      { fileId: 'b_1', file: { size: 20 } },
      { fileId: 'b_2', file: { size: 80000 } },
      { fileId: 'b_3', file: { size: 5 } },
    ];
    const plan = resume.batchResumePlan(items, 2, 4096);
    assert.strictEqual(plan.startIndex, 2);
    assert.strictEqual(plan.firstOffset, 4096);
    assert.strictEqual(plan.remaining.length, 2);
    assert.strictEqual(plan.remaining[0].fileId, 'b_2');
    const slices = resume.fileSlicePlan(80000, plan.firstOffset, resume.CHUNK);
    assert.strictEqual(slices.ranges[0].start, 4096);
  }

  // park + rpos for matching fp; different fp ignored; no gone
  {
    const park = new Map();
    const sender = { fp: 'fSEND' };
    const other = { fp: 'fOTHER' };
    resume.parkIncoming(park, sender, {
      fileId: 'fMid', got: 90000, chunks: [buf(50000, 1), buf(40000, 2)],
      meta: { fileId: 'fMid', size: 200000, name: 'a.bin' }, conv: 'dX',
    });
    const msgs = resume.rposMessagesForPeer(park, sender);
    assert.strictEqual(msgs.length, 1);
    assert.strictEqual(msgs[0].t, 'rpos');
    assert.strictEqual(msgs[0].fileId, 'fMid');
    assert.strictEqual(msgs[0].offset, 90000);

    const stray = resume.rposMessagesForPeer(park, other);
    assert.strictEqual(stray.length, 0, 'rpos for a different fingerprint must not be emitted');

    const myFiles = new Map();
    const myBatches = new Map();
    const handled = resume.handleIncomingRpos(msgs[0], myFiles, myBatches);
    assert.strictEqual(handled.kind, 'ignore', 'unknown fileId must not emit gone');
    assert.ok(!handled.gone);
  }

  // missing File → gone, not a shorter blob
  {
    const myFiles = new Map();
    myFiles.set('fGone', { meta: { fileId: 'fGone', size: 1000 }, file: null, card: null });
    const r = resume.handleIncomingRpos({ t: 'rpos', fileId: 'fGone', offset: 100 }, myFiles, new Map());
    assert.strictEqual(r.kind, 'gone');
    assert.deepStrictEqual(r.gone, { t: 'gone', fileId: 'fGone' });
    assert.ok(!r.job, 'must not assemble a shorter job when the File is gone');
  }

  // sender still holds File → requeue at reported offset
  {
    const file = { size: 200000, name: 'a.bin', type: 'application/octet-stream',
      slice(a, b) { return { arrayBuffer: async () => buf(Math.min(b, file.size) - a) }; } };
    const myFiles = new Map();
    myFiles.set('fMid', { file, meta: { fileId: 'fMid', size: 200000 }, card: {} });
    const r = resume.handleIncomingRpos({ t: 'rpos', fileId: 'fMid', offset: 90000 }, myFiles, new Map());
    assert.strictEqual(r.kind, 'requeue');
    assert.strictEqual(r.job.offset, 90000);
    assert.strictEqual(r.job.file, file);
    const plan = resume.fileSlicePlan(file.size, r.job.offset, resume.CHUNK);
    assert.strictEqual(plan.ranges[0].start, 90000);
  }

  // requeueIncomplete only for matching toFp
  {
    const file = { size: 50, name: 'x' };
    const myFiles = new Map();
    myFiles.set('f1', { file, meta: { fileId: 'f1' }, incomplete: { offset: 20, toFp: 'fPeer' } });
    const jobs = resume.requeueIncomplete(myFiles, new Map(), { fp: 'fPeer' });
    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0].offset, 20);
    const none = resume.requeueIncomplete(myFiles, new Map(), { fp: 'fOther' });
    assert.strictEqual(none.length, 0);
  }

  // applyGone only for matching fromFp
  {
    const park = new Map();
    resume.parkIncoming(park, { fp: 'fSEND' }, { fileId: 'fZ', got: 10, chunks: [], meta: {} });
    assert.strictEqual(resume.applyGoneToPark(park, { fileId: 'fZ' }, 'fNOPE'), false);
    assert.ok(park.has('fZ'));
    assert.strictEqual(resume.applyGoneToPark(park, { fileId: 'fZ' }, 'fSEND'), true);
    assert.ok(!park.has('fZ'));
  }

  // fmeta offset mismatch > 64KiB resets; small mismatch clips
  {
    const park = { kind: 'file', got: 80000, chunks: [buf(80000, 9)] };
    const reset = resume.applyFmetaOffset(park, 10000);
    assert.strictEqual(reset.reset, true);
    const park2 = { kind: 'file', got: 80000, chunks: [buf(80000, 9)] };
    const ok = resume.applyFmetaOffset(park2, 79000);
    assert.strictEqual(ok.reset, false);
    assert.strictEqual(ok.park.got, 79000);
  }

  // Channel open must not requeue sender incomplete (always 0 on first send).
  // Resume offset comes only from receiver rpos.
  {
    const park = new Map();
    const peer = { fp: 'fSEND' };
    resume.parkIncoming(park, peer, {
      fileId: 'fMid2', got: 90000, chunks: [buf(90000, 3)],
      meta: { fileId: 'fMid2', size: 200000 }, conv: 'dX',
    });
    const file = { size: 200000, name: 'a.bin' };
    const myFiles = new Map();
    myFiles.set('fMid2', {
      file, meta: { fileId: 'fMid2', size: 200000 }, card: {},
      incomplete: { offset: 0, toFp: 'fPeer' },
    });
    const act = resume.flushResumeActions(park, peer);
    assert.strictEqual(act.requeue.length, 0, 'open must not requeue sender incomplete');
    assert.strictEqual(act.rpos.length, 1);
    assert.strictEqual(act.rpos[0].offset, 90000);
    const r = resume.handleIncomingRpos(act.rpos[0], myFiles, new Map());
    assert.strictEqual(r.kind, 'requeue');
    assert.strictEqual(r.job.offset, 90000, 'sender must resume at receiver-reported offset');
    const plan = resume.fileSlicePlan(file.size, r.job.offset, resume.CHUNK);
    assert.strictEqual(plan.ranges[0].start, 90000);
    assert.strictEqual(myFiles.get('fMid2').incomplete, null);
  }

  // Batch fmeta at mid-file: keep writer, do not skip, do not reset got
  {
    const writes = [];
    const st = {
      done: 2, skipped: 0, cur: {
        fileId: 'b_2', path: 'c.bin', got: 4096, size: 80000,
        w: { write(c) { writes.push(c); }, close() { this.closed = true; } },
      },
    };
    const d = resume.applyBatchFmeta(st, { fileId: 'b_2', path: 'c.bin', size: 80000, offset: 4096 });
    assert.strictEqual(d.action, 'continue');
    assert.strictEqual(st.skipped, 0);
    assert.strictEqual(st.cur.got, 4096);
    assert.ok(!st.cur.w.closed);
  }

  // applyBatchFmetaAndOpen continue does not call file()/fileAt
  {
    let opened = 0;
    const st = {
      done: 2, skipped: 0,
      cur: { fileId: 'b_2', got: 4096, size: 80000, w: { close() {} } },
    };
    const d = await resume.applyBatchFmetaAndOpen(st, { fileId: 'b_2', size: 80000, offset: 4096 }, {
      file: () => { opened++; return { write() {}, close() {} }; },
      fileAt: () => { opened++; return { write() {}, close() {} }; },
    });
    assert.strictEqual(d.action, 'continue');
    assert.strictEqual(opened, 0);
    assert.strictEqual(st.skipped, 0);
    assert.strictEqual(st.cur.got, 4096);
  }

  // Dead writer + offset → fileAt seek, not a new file at 0
  {
    const disk = new Uint8Array(80000);
    disk.fill(7, 0, 4096);
    const st = { done: 2, skipped: 0, cur: null };
    const d = await resume.applyBatchFmetaAndOpen(st, { fileId: 'b_2', path: 'c.bin', size: 80000, offset: 4096 }, {
      file: () => { throw new Error('must not open from 0'); },
      fileAt: (_m, off) => resume.positionalWriter(
        (pos, u8) => { disk.set(u8, pos); },
        () => {},
        off
      ),
    });
    assert.strictEqual(d.action, 'reopen');
    assert.strictEqual(st.cur.got, 4096);
    const chunk = new Uint8Array(100);
    chunk.fill(9);
    st.cur.w.write(chunk);
    st.cur.got += 100;
    assert.ok([...disk.slice(0, 4096)].every(b => b === 7), 'prefix kept');
    assert.ok([...disk.slice(4096, 4196)].every(b => b === 9), 'resume bytes at offset');
    assert.strictEqual(st.cur.got, 4196);
  }

  // Duplicate rpos (onopen + connected) must not re-queue after the first accept
  {
    const file = { size: 200000, name: 'a.bin' };
    const myFiles = new Map();
    myFiles.set('fDup', { file, meta: { fileId: 'fDup', size: 200000 }, card: {} });
    const rpos = { t: 'rpos', fileId: 'fDup', offset: 90000 };
    const first = resume.handleIncomingRpos(rpos, myFiles, new Map());
    assert.strictEqual(first.kind, 'requeue');
    assert.strictEqual(first.job.offset, 90000);
    const second = resume.handleIncomingRpos(rpos, myFiles, new Map());
    assert.strictEqual(second.kind, 'ignore', 'second rpos must not start another pump');
    resume.markXferDone(myFiles.get('fDup'));
    const afterDone = resume.handleIncomingRpos(rpos, myFiles, new Map());
    assert.strictEqual(afterDone.kind, 'ignore', 'rpos after fend/fack must not re-pump');
  }

  // flushResumeActions sends each park rpos once
  {
    const park = new Map();
    const peer = { fp: 'fSEND' };
    resume.parkIncoming(park, peer, {
      fileId: 'fOnce', got: 90000, chunks: [buf(90000, 1)],
      meta: { fileId: 'fOnce', size: 200000 },
    });
    const a = resume.flushResumeActions(park, peer);
    assert.strictEqual(a.rpos.length, 1);
    const b = resume.flushResumeActions(park, peer);
    assert.strictEqual(b.rpos.length, 0, 'same park must not emit rpos twice');
  }

  // Receiver already saved: later fmeta (tail replay) is ignored, not a short blob
  {
    const parked = { kind: 'file', got: 90000, chunks: [buf(90000, 1)] };
    const saved = resume.applyIncomingFmeta('fSaved', 90000, parked, true, null);
    assert.strictEqual(saved.action, 'ignore');
    const keep = resume.applyIncomingFmeta('fKeep', 90000, null, false, {
      fileId: 'fKeep', chunks: [buf(90000, 2)], got: 90000,
    });
    assert.strictEqual(keep.action, 'keep');
    assert.strictEqual(keep.got, 90000);
  }

  // Park TTL and capacity
  {
    const park = new Map();
    const peer = { fp: 'fP' };
    for (let i = 0; i < 12; i++)
      resume.parkIncoming(park, peer, { fileId: 'fCap' + i, got: 10, chunks: [buf(10, 1)], meta: {} });
    assert.ok(park.size <= resume.MAX_PARK, 'park cap ' + park.size);
    const old = new Map();
    resume.parkIncoming(old, peer, { fileId: 'fOld', got: 1, chunks: [], meta: {} });
    old.get('fOld').parkedAt = Date.now() - resume.PARK_TTL_MS - 1;
    assert.strictEqual(resume.sweepPark(old), 1);
    assert.ok(!old.has('fOld'));
  }

  console.log('resume.test.js ok');
}

run().catch(err => { console.error(err); process.exit(1); });
