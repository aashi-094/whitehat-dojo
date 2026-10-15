import { describe,expect,it } from "vitest";
import { analyzeHeaders,analyzePassword,caesarShifts,decodeJwt,decodeText,encodeText,md5 } from "./toolkit";

describe("browser-only toolkit",()=>{
 it("generates MD5 digests and compares known output",()=>{expect(md5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");expect(md5("password")).toBe("5f4dcc3b5aa765d61d8327deb882cf99");});
 it("round-trips supported text encodings",()=>{for(const mode of ["Base64","URL","Hex","Binary","ROT13","Caesar"]){const shift=mode==="Caesar"?7:13;const encoded=encodeText(mode,"Whitehat dojo",shift);expect(decodeText(mode,encoded,shift)).toBe("Whitehat dojo");}});
 it("shows all 25 Caesar shifts",()=>{expect(caesarShifts("abc")).toHaveLength(25);expect(caesarShifts("abc")[2]?.text).toBe("def");});
 it("flags common passwords and gives practical guidance",()=>{expect(analyzePassword("password").isCommon).toBe(true);expect(analyzePassword("password").score).toBeLessThan(50);expect(analyzePassword("Long Random! Phrase 917").tips.length).toBeGreaterThan(0);});
 it("analyzes security headers and cookie flags",()=>{const checks=analyzeHeaders("Content-Security-Policy: default-src 'self'\nSet-Cookie: id=1; Secure; HttpOnly; SameSite=Strict");expect(checks.find(x=>x.label==="CSP")?.present).toBe(true);expect(checks.some(x=>x.label==="Cookie Secure"&&x.present)).toBe(true);expect(checks.find(x=>x.label==="HSTS")?.present).toBe(false);});
 it("warns if any cookie misses a security attribute",()=>{const checks=analyzeHeaders("Set-Cookie: session=1; Secure; HttpOnly; SameSite=Lax\nSet-Cookie: analytics=2");expect(checks.some(x=>x.label==="Cookie Secure"&&!x.present)).toBe(true);});
 it("decodes a JWT while warning that decoding is not verification",()=>{const token="eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJkb2pvIiwicm9sZSI6ImxlYXJuZXIiLCJleHAiOjQwMDAwMDAwMDB9.";const result=decodeJwt(token);expect("payload" in result&&result.payload.sub).toBe("dojo");expect("warning" in result&&result.warning).toMatch(/not verifying/);expect("error" in decodeJwt("not.jwt")).toBe(true);});
});
