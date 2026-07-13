import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";

export type Member = {
  id: string;
  token: string;
  name: string;
  neighborhood_association: string;
  school_district: string;
  payment_status: "未納" | "済";
};

const DB_PATH = path.join(__dirname, "..", "data", "members.db");
const SEED_JSON_PATH = path.join(__dirname, "..", "data", "members.json");

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    neighborhood_association TEXT NOT NULL,
    school_district TEXT NOT NULL,
    payment_status TEXT NOT NULL
  )
`);

function seedIfEmpty() {
  const row = db.prepare("SELECT COUNT(*) as c FROM members").get() as {
    c: number;
  };

  if (row.c > 0) return;
  if (!fs.existsSync(SEED_JSON_PATH)) return;

  const seedData: Member[] = JSON.parse(
    fs.readFileSync(SEED_JSON_PATH, "utf-8")
  );

  const insert = db.prepare(`
    INSERT INTO members (id, token, name, neighborhood_association, school_district, payment_status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    for (const m of seedData) {
      insert.run(
        m.id,
        m.token,
        m.name,
        m.neighborhood_association,
        m.school_district,
        m.payment_status
      );
    }
    db.exec("COMMIT");
    console.log(`[db] members.json から ${seedData.length} 件を初期投入しました`);
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

seedIfEmpty();

export function getMemberByToken(token: string): Member | undefined {
  const row = db
    .prepare("SELECT * FROM members WHERE token = ?")
    .get(token) as Member | undefined;
  return row;
}

export function getMemberById(id: string): Member | undefined {
  const row = db
    .prepare("SELECT * FROM members WHERE id = ?")
    .get(id) as Member | undefined;
  return row;
}

export function getAllMembers(): Member[] {
  return db.prepare("SELECT * FROM members").all() as Member[];
}
