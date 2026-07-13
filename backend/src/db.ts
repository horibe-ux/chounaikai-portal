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

const SEED_JSON_PATH = path.join(__dirname, "..", "data", "members.json");
let cachedMembers: Member[] | null = null;

function loadMembers(): Member[] {
  if (cachedMembers) {
    return cachedMembers;
  }

  if (!fs.existsSync(SEED_JSON_PATH)) {
    cachedMembers = [];
    return cachedMembers;
  }

  const seedData = JSON.parse(fs.readFileSync(SEED_JSON_PATH, "utf-8")) as Member[];
  cachedMembers = seedData;
  return cachedMembers;
}

export function getMemberByToken(token: string): Member | undefined {
  return loadMembers().find((member) => member.token === token);
}

export function getMemberById(id: string): Member | undefined {
  return loadMembers().find((member) => member.id === id);
}

export function getAllMembers(): Member[] {
  return [...loadMembers()];
}
