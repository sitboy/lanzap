'use strict';
const assert = require('assert');
const ice = require('../public/ice-restart.js');

function run() {
  const p = { initiator: true, iceTries: 0, iceBusy: false, pc: {} };

  assert.strictEqual(ice.iceEventAction(p, 'connected').action, 'reset');
  assert.strictEqual(ice.iceEventAction(p, 'closed').action, 'none');

  const d = ice.iceEventAction(p, 'disconnected');
  assert.strictEqual(d.action, 'wait');
  assert.strictEqual(d.delay, ice.DISCONNECT_WAIT_MS);

  const f = ice.iceEventAction(p, 'failed');
  assert.strictEqual(f.action, 'restart');
  assert.ok(ice.shouldOfferRestart(p));
  assert.ok(ice.beginRestart(p));
  assert.strictEqual(p.iceTries, 1);
  assert.strictEqual(p.iceBusy, true);
  assert.ok(!ice.shouldOfferRestart(p), 'busy lock blocks stacked offers');
  ice.endRestart(p);
  assert.ok(ice.shouldOfferRestart(p));

  p.iceTries = ice.MAX_TRIES;
  assert.strictEqual(ice.iceEventAction(p, 'failed').action, 'stuck');
  assert.ok(!ice.beginRestart(p));

  const answerer = { initiator: false, iceTries: 0, iceBusy: false, pc: {} };
  assert.ok(!ice.shouldOfferRestart(answerer), 'only initiator creates the restart offer');
  assert.strictEqual(ice.iceEventAction(answerer, 'failed').action, 'restart');

  ice.resetTries(p);
  assert.strictEqual(p.iceTries, 0);
  assert.strictEqual(p.iceBusy, false);

  console.log('ice-restart.test.js ok');
}

run();
