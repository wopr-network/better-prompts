import { betterPrompts, type BetterPrompts } from "@wopr-network/better-prompts";
import { SqliteStore } from "@wopr-network/better-prompts/store";

const DB_PATH = process.env.PROMPTLIB_DB ?? "./promptlib-ui.db";

// Pin the singleton across Next.js dev-mode hot reloads. Without this,
// every render-cycle creates a fresh SqliteStore and the better-sqlite3
// binding leaks file handles.
const globalCache = globalThis as unknown as {
  __bp?: BetterPrompts;
  __bpStore?: SqliteStore;
};

if (!globalCache.__bp) {
  globalCache.__bpStore = new SqliteStore({ path: DB_PATH });
  globalCache.__bp = betterPrompts({ store: globalCache.__bpStore });
}

export const bp: BetterPrompts = globalCache.__bp;
