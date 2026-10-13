import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

function loadOptionalEnv(filePath: string): void {
  try {
    const text = readFileSync(filePath, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Backend .env is optional when secrets are already in the environment.
  }
}

loadOptionalEnv(path.resolve(__dirname, '../backend/.env'));

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: '3000',
      NEXT_PUBLIC_DATA_MODE: 'api',
      NEXT_PUBLIC_API_BASE_URL: apiBase,
    },
  },
});
