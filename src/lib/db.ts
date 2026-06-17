import fs from "fs";
import path from "path";
import { DB } from "./types";
import { generateSeed } from "./seed";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

// Cache the DB on the global so it survives across requests in dev and within a
// warm server instance in production.
declare global {
  // eslint-disable-next-line no-var
  var __LC_DB__: DB | undefined;
}

// File persistence is best-effort. On serverless hosts (Vercel/Netlify) the
// filesystem is read-only, so writes are skipped and the in-memory cache is the
// source of truth. The seed is deterministic, so a cold start regenerates the
// exact same demo data.
function tryWrite(db: DB): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch {
    // read-only FS (serverless) — keep running on the in-memory cache only
  }
}

function load(): DB {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as DB;
    }
  } catch {
    // missing or corrupt file — fall through to a fresh seed
  }
  const seed = generateSeed();
  tryWrite(seed);
  return seed;
}

export function getDB(): DB {
  if (!global.__LC_DB__) {
    global.__LC_DB__ = load();
  }
  return global.__LC_DB__;
}

export function saveDB(db: DB) {
  global.__LC_DB__ = db;
  tryWrite(db);
}

export function resetDB() {
  const seed = generateSeed();
  saveDB(seed);
  return seed;
}
