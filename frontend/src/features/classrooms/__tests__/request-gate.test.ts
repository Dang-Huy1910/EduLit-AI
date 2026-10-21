import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassDataStore } from '../class-data-store-factory';
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

test('đổi kỳ khi request cũ chưa xong chỉ giữ kết quả của kỳ mới', async () => {
  type Classroom = { id: string };
  let resolveA!: (value: { items: Classroom[] }) => void;
  let resolveB!: (value: { items: Classroom[] }) => void;
  const pendingA = new Promise<{ items: Classroom[] }>((done) => { resolveA = done; });
  const pendingB = new Promise<{ items: Classroom[] }>((done) => { resolveB = done; });
  const store = createClassDataStore<Classroom>((termId) => termId === 'A' ? pendingA : pendingB);

  const loadingA = store.getState().loadClassrooms('A');
  const loadingB = store.getState().loadClassrooms('B');
  resolveB({ items: [{ id: 'B-1' }] });
  await loadingB;

  assert.equal(store.getState().classroomsLoadedForTermId, 'B');
  assert.deepEqual(store.getState().classrooms, [{ id: 'B-1' }]);

  resolveA({ items: [{ id: 'A-1' }] });
  await loadingA;
  assert.equal(store.getState().classroomsLoadedForTermId, 'B');
  assert.deepEqual(store.getState().classrooms, [{ id: 'B-1' }]);
});
