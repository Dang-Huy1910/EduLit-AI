import { Client } from "pg";
import { requireDatabaseUrl } from "./env.js";
import { databaseNameFromUrl, sanitizeErrorMessage } from "../../core/sanitize.js";

async function main(): Promise<void> {
  const url = requireDatabaseUrl();
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const result = await client.query<{
      db: string;
      usr: string;
      ready: number;
    }>("select current_database() as db, current_user as usr, 1 as ready");
    const row = result.rows[0];
    if (!row) {
      throw new Error("Connection succeeded but returned no row");
    }
    console.log(
      `database connection ok name=${row.db} user=${row.usr} expectedName=${databaseNameFromUrl(url)}`,
    );
  } catch (error) {
    console.error(`database connection failed: ${sanitizeErrorMessage(error)}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

await main();
