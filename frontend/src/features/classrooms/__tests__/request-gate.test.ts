import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestGate } from '../request-gate';

test('request gate dùng lại promise đang chạy và mở lại sau khi hoàn tất', async () => {
  const gate = createRequestGate<number>();
  let calls = 0;
  let resolve!: (value: number) => void;
  const pending = new Promise<number>((done) => {
    resolve = done;
  });
  const first = gate.run(() => {
    calls += 1;
    return pending;
  });
  const second = gate.run(() => {
    calls += 1;
    return Promise.resolve(2);
  });

  assert.strictEqual(first, second);
  assert.equal(calls, 1);
  resolve(1);
  assert.equal(await first, 1);
  assert.equal(await gate.run(async () => {
    calls += 1;
    return 3;
  }), 3);
  assert.equal(calls, 2);
});
