/**
 * Local development database — embedded PostgreSQL, no system install needed.
 * Data lives in .pgdata/ (gitignored). Matches the default .env:
 *   DATABASE_URL=postgresql://postgres:password@localhost:5433/leatherchem
 *
 * Usage: npm run db:local          (starts and keeps running; Ctrl+C to stop)
 * For production / staging, point DATABASE_URL at Neon instead.
 */
import EmbeddedPostgres from "embedded-postgres";

const pg = new EmbeddedPostgres({
  databaseDir: "./.pgdata",
  user: "postgres",
  password: "password",
  port: 5433,
  persistent: true,
});

async function main() {
  const fs = await import("fs");
  const fresh = !fs.existsSync("./.pgdata/PG_VERSION");
  if (fresh) {
    console.log("Initialising local Postgres cluster in .pgdata/ ...");
    await pg.initialise();
  }
  await pg.start();
  if (fresh) {
    await pg.createDatabase("leatherchem");
    console.log("Created database 'leatherchem'.");
  }
  console.log(
    "Local Postgres running on port 5433 (postgres/password). Press Ctrl+C to stop.",
  );

  const stop = async () => {
    console.log("\nStopping local Postgres...");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pg.stop();
  } catch {}
  process.exit(1);
});
