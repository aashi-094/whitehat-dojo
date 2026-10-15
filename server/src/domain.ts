import crypto from "node:crypto";

export const levelForXp = (xp: number): number => Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
export const xpToNextLevel = (xp: number): number => levelForXp(xp) ** 2 * 100;
export const hintAdjustedPoints = (points: number, hintsUsed: number): number =>
  Math.max(Math.ceil(points * 0.4), Math.floor(points * (1 - Math.max(0, hintsUsed) * 0.2)));
export const hashFlag = (flag: string): string => crypto.createHash("sha256").update(flag.trim()).digest("hex");
export const verifyFlag = (candidate: string, hash: string): boolean => {
  const actual = Buffer.from(hashFlag(candidate), "hex");
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

type FakeRow = { username: string; password: string };
export function fakeSqlLogin(input: string, password: string): { ok: boolean; error?: string; injected?: boolean } {
  const rows: FakeRow[] = [{ username: "learner", password: "dojo-pass" },{username:"admin",password:"admin-demo-only"}];
  const normalized = input.trim();
  if (/;\s*(DROP|UPDATE|DELETE|INSERT)\b/i.test(normalized)) return { ok: false, error: "Unsupported statement" };
  if (/unknown_column|nonexistent_column/i.test(normalized)) return { ok: false, error: "Unknown column: this safe parser recognizes only username and password." };
  if (/\b(?:SELECT|UNION|FROM)\b/i.test(normalized)) return { ok: false, error: "Syntax error: unsupported token in the toy login grammar." };
  if (normalized === "admin'--") return {ok:rows.some(row=>row.username==="admin"),injected:true};
  if (/^'\s*OR\s*1\s*=\s*1\s*--$/i.test(normalized)) return {ok:rows.length>0,injected:true};
  if ((normalized.match(/'/g)??[]).length % 2 !== 0) return {ok:false,error:"Syntax error: unclosed quote in toy login grammar."};
  const match = normalized.match(/^(?:learner|guest|admin)$/i);
  if (!match) return { ok: false };
  return { ok: rows.some(row => row.username === match[0].toLowerCase() && row.password === password) };
}
