-- Extra databases for Prisma migrate shadow + isolated tests.
-- Runs only on first volume init as the Compose bootstrap role.
SELECT 'CREATE DATABASE edulit_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'edulit_test')\gexec

SELECT 'CREATE DATABASE edulit_shadow'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'edulit_shadow')\gexec
