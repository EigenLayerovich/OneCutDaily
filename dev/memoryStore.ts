import type { Store } from '../src/server/core/game';

/** Minimal in-memory stand-in for Devvit Redis, for local play and tests. */
export const memoryStore = (): Store & { dump: () => Map<string, unknown> } => {
  const kv = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const zsets = new Map<string, Map<string, number>>();
  const h = (k: string) => hashes.get(k) ?? hashes.set(k, new Map()).get(k)!;
  const z = (k: string) => zsets.get(k) ?? zsets.set(k, new Map()).get(k)!;
  const sorted = (k: string) =>
    [...z(k).entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => a.score - b.score || (a.member < b.member ? -1 : 1));
  return {
    dump: () => new Map<string, unknown>([...kv, ...hashes, ...zsets]),
    get: async (k) => kv.get(k),
    set: async (k, v) => kv.set(k, v),
    incrBy: async (k, v) => {
      const n = Number(kv.get(k) ?? 0) + v;
      kv.set(k, String(n));
      return n;
    },
    hGet: async (k, f) => h(k).get(f),
    hSet: async (k, fv) => {
      let added = 0;
      for (const [f, v] of Object.entries(fv)) {
        if (!h(k).has(f)) added++;
        h(k).set(f, v);
      }
      return added;
    },
    hSetNX: async (k, f, v) => {
      if (h(k).has(f)) return 0;
      h(k).set(f, v);
      return 1;
    },
    hGetAll: async (k) => Object.fromEntries(h(k)),
    hIncrBy: async (k, f, v) => {
      const n = Number(h(k).get(f) ?? 0) + v;
      h(k).set(f, String(n));
      return n;
    },
    zAdd: async (k, ...members) => {
      for (const m of members) z(k).set(m.member, m.score);
      return members.length;
    },
    zRank: async (k, m) => {
      const i = sorted(k).findIndex((r) => r.member === m);
      return i < 0 ? undefined : i;
    },
    zScore: async (k, m) => z(k).get(m),
    zCard: async (k) => z(k).size,
    zRange: async (k, start, stop) => sorted(k).slice(start, stop + 1),
  };
};
