import { execFileSync } from 'node:child_process';

/**
 * Auth rate-limit buckets live in PostgreSQL for 15 minutes.
 * Truncate them so a local e2e rerun is not blocked by the previous suite.
 */
export default function globalSetup(): void {
  const url =
    process.env.E2E_DATABASE_URL ||
    'postgresql://edulit:edulit_dev@localhost:5433/edulit_auth';
  execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-c', 'TRUNCATE rate_limit_buckets;'], {
    stdio: 'inherit',
  });
}
