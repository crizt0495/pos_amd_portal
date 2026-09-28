'use strict';
/* Smoke test hwid.js + normalisasi serial key (desktop) */
const path = require('node:path');
const REPO = path.resolve(__dirname, '..', '..');
const { getHwid, normalizeHwid, deviceName } = require(path.join(REPO, 'desktop', 'electron', 'hwid.js'));
const { normalizeSerialKey } = require(path.join(REPO, 'desktop', 'electron', 'license.js'));

let failed = 0;
function check(name, cond, extra = '') {
  if (cond) console.log('  OK  ', name);
  else {
    failed += 1;
    console.log('  FAIL', name, extra);
  }
}

(async () => {
  const hw = await getHwid();
  check('hwid ok', hw.ok === true, JSON.stringify(hw));
  check('hwid 32 hex uppercase', /^[0-9A-F]{32}$/.test(hw.hwid || ''), hw.hwid);
  check('deviceName ada', Boolean(hw.deviceName), hw.deviceName);
  check('source tercatat', Boolean(hw.source), hw.source);
  check('cache stabil', (await getHwid()).hwid === hw.hwid);

  check('normalize UUID mentah', /^[0-9A-F]{32}$/.test(normalizeHwid('1a2b-3c4d-5e6f-7a8b')));
  check('normalize hex 32 hex huruf besar', normalizeHwid('0123456789abcdef0123456789abcdef') === '0123456789ABCDEF0123456789ABCDEF');
  check('normalize kosong', normalizeHwid('') === '');
  check('deviceName() string', typeof deviceName() === 'string');

  /* -------------------- normalisasi serial key --------------------- */
  const cases = [
    ['KPRO-ABCD-2345-6XYZ', 'KPRO-ABCD-2345-6XYZ'],
    ['kpro abcd 2345 6xyz', 'KPRO-ABCD-2345-6XYZ'],
    ['KPROABCD23456XYZ', 'KPRO-ABCD-2345-6XYZ'],
    ['  KPRO-ABCD-2345-6XYZ  ', 'KPRO-ABCD-2345-6XYZ'],
    ['abcd-2345-6xyz', 'KPRO-ABCD-2345-6XYZ'],
    ['KPRO-KPRO-ABCD-2345-6XYZ', 'KPRO-ABCD-2345-6XYZ'],
    ['KPRO9XYZ', 'KPRO-9XYZ'],
    ['KPRO-AB0D-2345-6IYZ', 'KPRO-AB0D-2345-6IYZ'],
  ];
  for (const [input, expected] of cases) {
    const got = normalizeSerialKey(input);
    check(`serial "${input}"`, got === expected, `dapat ${got}, harap ${expected}`);
  }
  check('serial kosong', normalizeSerialKey('!!!') === '');

  console.log(failed === 0 ? '\nSEMUA TES LULUS' : `\n${failed} TES GAGAL`);
  process.exit(failed === 0 ? 0 : 1);
})();
