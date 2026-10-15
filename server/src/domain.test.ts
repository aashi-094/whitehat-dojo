import { describe,expect,it } from "vitest";
import { fakeSqlLogin,hashFlag,hintAdjustedPoints,levelForXp,verifyFlag,xpToNextLevel } from "./domain.js";

describe("experience, levels, and hints",()=>{
 it("calculates levels and thresholds",()=>{expect(levelForXp(0)).toBe(1);expect(levelForXp(399)).toBe(2);expect(levelForXp(400)).toBe(3);expect(xpToNextLevel(0)).toBe(100);});
 it("keeps hint penalties proportional with a 40% floor",()=>{expect(hintAdjustedPoints(100,0)).toBe(100);expect(hintAdjustedPoints(100,1)).toBe(80);expect(hintAdjustedPoints(100,2)).toBe(60);expect(hintAdjustedPoints(100,3)).toBe(40);expect(hintAdjustedPoints(100,9)).toBe(40);});
});
describe("flag verification",()=>{
 it("stores and verifies only the SHA-256 digest",()=>{const digest=hashFlag("WD{safe_demo}");expect(digest).toMatch(/^[a-f0-9]{64}$/);expect(digest).not.toContain("safe_demo");expect(verifyFlag("WD{safe_demo}",digest)).toBe(true);expect(verifyFlag("WD{wrong}",digest)).toBe(false);});
});
describe("simulated SQL parser",()=>{
 it("accepts a normal login and denies its wrong password",()=>{expect(fakeSqlLogin("learner","dojo-pass").ok).toBe(true);expect(fakeSqlLogin("learner","wrong").ok).toBe(false);});
 it("simulates admin comment injection without executing SQL",()=>{expect(fakeSqlLogin("admin'--","anything")).toMatchObject({ok:true,injected:true});});
 it("simulates a tautology payload in the fixed fake row set",()=>{expect(fakeSqlLogin("' OR 1=1 --","anything")).toMatchObject({ok:true,injected:true});});
 it("reports malformed quotes and unknown columns",()=>{expect(fakeSqlLogin("admin'","x").error).toMatch(/Syntax error/);expect(fakeSqlLogin("unknown_column","x").error).toMatch(/Unknown column/);});
});
