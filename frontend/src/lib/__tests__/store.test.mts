import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createJSONStorage } from 'zustand/middleware';
import { useAppStore } from '../store';
import type { User } from '../types';

const initialState = useAppStore.getState();
const user: User = {
  id: 'authenticated-student',
  name: 'Học sinh kiểm thử',
  role: 'student',
  email: 'student@example.test',
  school: 'Trường kiểm thử',
  avatarInitials: 'HT',
};
let stored: string | null = null;
let storageKey = '';

beforeEach(() => {
  useAppStore.persist.setOptions({
    storage: createJSONStorage(() => ({
      getItem: () => stored,
      setItem: (key, value) => { storageKey = key; stored = value; },
      removeItem: () => { stored = null; },
    })),
  });
  useAppStore.setState(initialState, true);
  stored = null;
});

async function hydrate(state: unknown, version = 0) {
  stored = JSON.stringify({ state, version });
  await useAppStore.persist.rehydrate();
}

function persistedState() {
  assert.notEqual(stored, null);
  return JSON.parse(stored!);
}

for (const sidebarCollapsed of [true, false]) {
  test(`existing browser state migrates with sidebarCollapsed=${sidebarCollapsed}`, async () => {
    await hydrate({
      sidebarCollapsed,
      assignments: [{ id: 'old-assignment' }],
      submissions: { old: { pages: [] } },
      outline: [{ points: ['old-outline'] }],
      currentUser: { id: 'stale-user' },
    });

    assert.deepEqual(useAppStore.getState(), { ...initialState, sidebarCollapsed });
    assert.equal(storageKey, 'edulit-app-v2');
    assert.deepEqual(persistedState(), { state: { sidebarCollapsed }, version: 1 });
  });
}

test('invalid legacy preferences fall back to the expanded sidebar without restoring other fields', async () => {
  for (const state of [null, [], 'invalid', {}, { sidebarCollapsed: 'true' }, { sidebarCollapsed: 1 }]) {
    await hydrate(state);
    assert.deepEqual(useAppStore.getState(), initialState);
    assert.deepEqual(persistedState(), { state: { sidebarCollapsed: false }, version: 1 });
  }
});

test('hydration accepts only the sidebar preference even when the storage version is current', async () => {
  useAppStore.getState().setUser(user);
  await hydrate({
    sidebarCollapsed: true,
    currentUser: { id: 'stale-user' },
    toasts: [{ id: 'stale-toast' }],
    toggleSidebar: 'invalid-action',
  }, 1);

  assert.deepEqual(useAppStore.getState(), { ...initialState, currentUser: user, sidebarCollapsed: true });
  useAppStore.getState().toggleSidebar();
  assert.equal(useAppStore.getState().sidebarCollapsed, false);
  useAppStore.getState().clearAuthUser();
  assert.equal(useAppStore.getState().currentUser, null);
  assert.deepEqual(persistedState(), { state: { sidebarCollapsed: false }, version: 1 });
});

test('unversioned browser state is filtered and subsequent writes persist only the sidebar', async () => {
  stored = JSON.stringify({ state: { sidebarCollapsed: true, assignments: [{ id: 'old' }] } });
  await useAppStore.persist.rehydrate();
  assert.deepEqual(useAppStore.getState(), { ...initialState, sidebarCollapsed: true });

  useAppStore.getState().setUser(user);
  assert.deepEqual(useAppStore.getState().currentUser, user);
  assert.deepEqual(persistedState(), { state: { sidebarCollapsed: true }, version: 1 });
});

test('malformed browser JSON leaves the store usable and the next write replaces it', async () => {
  stored = '{invalid-json';
  await useAppStore.persist.rehydrate();
  assert.deepEqual(useAppStore.getState(), initialState);

  useAppStore.getState().toggleSidebar();
  assert.deepEqual(persistedState(), { state: { sidebarCollapsed: true }, version: 1 });
});
