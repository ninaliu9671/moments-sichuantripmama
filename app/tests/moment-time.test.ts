import test from 'node:test';
import assert from 'node:assert/strict';
import { shanghaiMinuteInput, shanghaiMinuteToIso } from '../lib/moment-time';

test('record picker uses the selected Beijing date and minute', () => {
  assert.equal(shanghaiMinuteInput('2026-09-21T04:37:45.123Z'), '2026-09-21T12:37');
  assert.equal(shanghaiMinuteToIso('2026-09-21T12:37'), '2026-09-21T04:37:00.000Z');
  assert.throws(() => shanghaiMinuteToIso('2026-02-30T12:37'));
});
