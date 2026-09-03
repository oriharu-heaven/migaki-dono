import Dexie, { type Table } from "dexie";
import type { CheckInSession, Slot } from "./types";

/**
 * §8 IndexedDB(Dexie)で永続化する。localStorage は容量と型の面で使わない。
 * （設定値のみ、起動レイテンシ要件のため localStorage を使う。lib/settings.ts 参照）
 */
class MigakiDB extends Dexie {
  sessions!: Table<CheckInSession, string>;

  constructor() {
    super("migaki-dono");
    this.version(1).stores({
      // date+slot で「そのスロットが完了済みか」を引く。上書きせず追記するので複合キーは主キーにしない
      sessions: "id, date, slot, startedAt, [date+slot]",
    });
  }
}

export const db = new MigakiDB();

export async function saveSession(session: CheckInSession): Promise<void> {
  await db.sessions.put(session);
}

export async function getSessionsForDate(date: string): Promise<CheckInSession[]> {
  return db.sessions.where("date").equals(date).toArray();
}

export async function isSlotDone(date: string, slot: Slot): Promise<boolean> {
  const n = await db.sessions
    .where("[date+slot]")
    .equals([date, slot])
    .filter((s) => s.completedAt !== null)
    .count();
  return n > 0;
}

/** 直近 n 日分（今日を含む）のセッションを新しい順に返す */
export async function getRecentSessions(days: number): Promise<CheckInSession[]> {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return db.sessions.where("startedAt").above(since).reverse().sortBy("startedAt");
}

export async function getAllSessions(): Promise<CheckInSession[]> {
  return db.sessions.orderBy("startedAt").toArray();
}

export async function deleteAllData(): Promise<void> {
  await db.sessions.clear();
}
