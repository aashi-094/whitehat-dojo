import { afterAll,beforeAll,describe,expect,it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { hashFlag } from "./domain.js";
import supertest from "supertest";
import type { Express } from "express";
import type Database from "better-sqlite3";

const dir=fs.mkdtempSync(path.join(os.tmpdir(),"whitehat-dojo-test-"));
process.env.DATABASE_PATH=path.join(dir,"api.sqlite");
process.env.JWT_SECRET="test-secret-long-enough";
let app:Express,db:Database.Database,request:ReturnType<typeof supertest>;
let cookie:string;
beforeAll(async()=>{
 const [{app:loadedApp},{db:loadedDb}]=await Promise.all([import("./app.js"),import("./db.js")]);
 app=loadedApp;db=loadedDb;request=supertest(app);
 db.prepare("INSERT INTO labs(title,slug,category,difficulty,description,flag_hash,points) VALUES(?,?,?,?,?,?,?)").run("Test lab","test-lab","Web","Easy","API test challenge",hashFlag("WD{api_test}"),100);
 const lesson=db.prepare("INSERT INTO lessons(track,title,slug,content,position) VALUES(?,?,?,?,?)").run("Foundations","API quiz lesson","api-quiz","Test lesson content for API quiz grading.",99);
 const insertQuestion=db.prepare("INSERT INTO quiz_questions(lesson_id,question,options,answer,explanation) VALUES(?,?,?,?,?)");
 for(let answer=0;answer<3;answer++)insertQuestion.run(Number(lesson.lastInsertRowid),`API question ${answer+1}`,JSON.stringify(["A","B","C"]),answer,"Answer explanation.");
},30000);
afterAll(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
describe("REST API",()=>{
 it("signs up with an explicit pledge and supports username/email login",async()=>{
  const created=await request.post("/api/auth/signup").send({username:"testlearner",email:"test@example.com",password:"securePassword123!",pledge:true});
  expect(created.status).toBe(201);expect(created.body.user.role).toBe("user");expect(created.headers["set-cookie"]?.[0]).toMatch(/HttpOnly/i);cookie=created.headers["set-cookie"][0].split(";")[0];
  expect((await request.post("/api/auth/login").send({identity:"test@example.com",password:"securePassword123!"})).status).toBe(200);
  expect((await request.post("/api/auth/signup").send({username:"nopledge",email:"no@example.com",password:"securePassword123!"})).status).toBe(400);
 });
 it("protects authenticated routes and rejects wrong credentials",async()=>{
  expect((await request.get("/api/profile")).status).toBe(401);
  expect((await request.post("/api/auth/login").send({identity:"testlearner",password:"wrong-password"})).status).toBe(401);
  expect((await request.get("/api/profile").set("Cookie",cookie)).status).toBe(200);
 });
 it("verifies a flag server-side, awards points once, and populates leaderboard",async()=>{
  const wrong=await request.post("/api/labs/1/submit").set("Cookie",cookie).send({flag:"WD{wrong}"});
  expect(wrong.status).toBe(400);
  const solved=await request.post("/api/labs/1/submit").set("Cookie",cookie).send({flag:"WD{api_test}"});
  expect(solved.status).toBe(200);expect(solved.body.points).toBe(100);
  expect((await request.post("/api/labs/1/submit").set("Cookie",cookie).send({flag:"WD{api_test}"})).body.alreadySolved).toBe(true);
  const leaderboard=await request.get("/api/leaderboard").set("Cookie",cookie);
  expect(leaderboard.status).toBe(200);expect(leaderboard.body.users[0].username).toBe("testlearner");expect(leaderboard.body.users[0].xp).toBe(100);
 });
 it("returns three quiz questions and awards lesson XP only on the first pass",async()=>{
  const id=(db.prepare("SELECT id FROM lessons WHERE slug='api-quiz'").get() as {id:number}).id;
  const quiz=await request.get(`/api/lessons/${id}`).set("Cookie",cookie);
  expect(quiz.body.questions).toHaveLength(3);
  const answers=Object.fromEntries(quiz.body.questions.map((q:{id:number},index:number)=>[q.id,index]));
  const first=await request.post(`/api/lessons/${id}/quiz`).set("Cookie",cookie).send({answers});
  expect(first.body).toMatchObject({score:3,total:3,passed:true,reward:50});
  const second=await request.post(`/api/lessons/${id}/quiz`).set("Cookie",cookie).send({answers});
  expect(second.body.reward).toBe(0);
 });
});
