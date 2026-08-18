'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '../public/i18n.js'), 'utf8');
const sandbox = { navigator: { language: 'en' }, localStorage: {} };
sandbox.window = sandbox;
vm.runInNewContext(src, sandbox);
const { I18N, LANGS } = sandbox;
const need = [
  'my_devices', 'paired_tag', 'unpair', 'unpair_confirm', 'connect_relay', 'connect_qr',
  'pair_qr_tip', 'pair_miss', 'pair_limit', 'resuming', 'resume_reset', 'file_gone',
  'forget_paired', 'send_to_device', 'send_to_computer',
];

assert.ok(I18N.en && I18N.zh);
for (const [code] of LANGS) {
  const pack = I18N[code];
  assert.ok(pack, 'missing pack ' + code);
  const miss = need.filter(k => !pack[k]);
  assert.deepStrictEqual(miss, [], code + ' missing pairing keys: ' + miss.join(','));
}
console.log('i18n.test.js ok');
