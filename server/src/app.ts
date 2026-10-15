import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "./db.js";
import { fakeSqlLogin, hashFlag, hintAdjustedPoints, levelForXp, verifyFlag } from "./domain.js";

const app = express();
const secret = process.env.JWT_SECRET ?? "development-only-change-this-secret-to-a-long-random-value";
const cookieName = "dojo_session";
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

type User = { id: number; username: string; email: string; role: "user"|"admin"; xp: number; streak: number; last_active: string|null; disabled?: number };
declare global { namespace Express { interface Request { user?: User } } }
const asyncRoute = (handler: (req: Request, res: Response, next: NextFunction) => unknown) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(handler(req,res,next)).catch(next);
const fail = (res: Response, status: number, message: string, code: string) =>
  res.status(status).json({ error: { message, code } });
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies[cookieName];
    if (!token) return fail(res,401,"Sign in to continue","UNAUTHORIZED");
    const claims = jwt.verify(token,secret) as {id:number};
    const user = db.prepare("SELECT id,username,email,role,xp,streak,last_active,disabled FROM users WHERE id=?").get(claims.id) as User|undefined;
    if (!user || user.disabled) return fail(res,401,"Account is unavailable","UNAUTHORIZED");
    req.user = user;
    next();
  } catch { return fail(res,401,"Session expired or invalid","UNAUTHORIZED"); }
};
const requireAdmin = (req: Request,res: Response,next: NextFunction) => req.user?.role === "admin" ? next() : fail(res,403,"Administrator access required","FORBIDDEN");
const publicUser = (u: User) => ({id:u.id,username:u.username,email:u.email,role:u.role,xp:u.xp,level:levelForXp(u.xp),streak:u.streak});
function awardXp(userId:number, amount:number, action:string, detail:string) {
  const user = db.prepare("SELECT xp,last_active,streak FROM users WHERE id=?").get(userId) as {xp:number;last_active:string|null;streak:number};
  const now = new Date();
  const today = now.toISOString().slice(0,10);
  const last = user.last_active?.slice(0,10);
  const yesterday = new Date(now.getTime()-86400000).toISOString().slice(0,10);
  const streak = last === today ? user.streak : last === yesterday ? user.streak+1 : 1;
  db.prepare("UPDATE users SET xp=xp+?,last_active=?,streak=? WHERE id=?").run(amount,now.toISOString(),streak,userId);
  db.prepare("INSERT INTO activity_log(user_id,action,detail) VALUES(?,?,?)").run(userId,action,detail);
  const total = (db.prepare("SELECT xp FROM users WHERE id=?").get(userId) as {xp:number}).xp;
  const solved = (db.prepare("SELECT COUNT(*) AS n FROM lab_solves WHERE user_id=?").get(userId) as {n:number}).n;
  const completed = (db.prepare("SELECT COUNT(*) AS n FROM lesson_progress WHERE user_id=?").get(userId) as {n:number}).n;
  const award = (key:string,condition:boolean) => { if(condition) db.prepare("INSERT OR IGNORE INTO badges_earned(user_id,badge_key) VALUES(?,?)").run(userId,key); };
  const trackComplete=Boolean(db.prepare(`SELECT 1 FROM lessons l LEFT JOIN lesson_progress p ON p.lesson_id=l.id AND p.user_id=?
    GROUP BY l.track HAVING COUNT(*)=SUM(CASE WHEN p.lesson_id IS NOT NULL THEN 1 ELSE 0 END) LIMIT 1`).get(userId));
  const cleanSolve=Boolean(db.prepare("SELECT 1 FROM lab_solves s JOIN labs l ON l.id=s.lab_id WHERE s.user_id=? AND s.points_awarded=l.points LIMIT 1").get(userId));
  award("first_blood",solved>=1); award("scholar",completed>=3); award("track_complete",trackComplete);
  award("clean_solve",cleanSolve);
  award("sharpshooter",solved>=5); award("on_a_roll",streak>=3); award("level_5",levelForXp(total)>=5);
  return {xp:total,level:levelForXp(total),streak};
}

app.get("/api/health",(_req,res)=>res.json({ok:true}));
app.post("/api/auth/signup",asyncRoute(async(req,res)=>{
  const schema=z.object({username:z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_-]+$/),email:z.string().trim().email().max(254),password:z.string().min(10).max(128),pledge:z.literal(true)});
  const parsed=schema.safeParse(req.body);
  if(!parsed.success) return fail(res,400,parsed.error.issues[0]?.message??"Invalid signup details","VALIDATION_ERROR");
  const {username,email,password}=parsed.data;
  try {
    const result=db.prepare("INSERT INTO users(username,email,password_hash) VALUES(?,?,?)").run(username,email.toLowerCase(),await bcrypt.hash(password,12));
    const id=Number(result.lastInsertRowid);
    db.prepare("INSERT INTO activity_log(user_id,action,detail) VALUES(?,?,?)").run(id,"account_created","Joined Whitehat Dojo");
    const token=jwt.sign({id},secret,{expiresIn:"7d"});
    res.cookie(cookieName,token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*86400000});
    return res.status(201).json({user:publicUser(db.prepare("SELECT id,username,email,role,xp,streak FROM users WHERE id=?").get(id) as User)});
  } catch(error) { if((error as {code?:string}).code==="SQLITE_CONSTRAINT_UNIQUE") return fail(res,409,"Username or email is already registered","CONFLICT"); throw error; }
}));
app.post("/api/auth/login",asyncRoute(async(req,res)=>{
  const schema=z.object({identity:z.string().trim().min(1).max(254),password:z.string().min(1).max(128)});
  const parsed=schema.safeParse(req.body);
  if(!parsed.success) return fail(res,400,"Enter your username or email and password","VALIDATION_ERROR");
  const u=db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE").get(parsed.data.identity,parsed.data.identity) as (User&{password_hash:string})|undefined;
  if(!u||u.disabled||!(await bcrypt.compare(parsed.data.password,u.password_hash))) return fail(res,401,"Invalid username/email or password","INVALID_CREDENTIALS");
  res.cookie(cookieName,jwt.sign({id:u.id},secret,{expiresIn:"7d"}),{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*86400000});
  return res.json({user:publicUser(u)});
}));
app.post("/api/auth/logout",(_req,res)=>res.clearCookie(cookieName,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production"}).json({ok:true}));
app.get("/api/auth/me",requireAuth,(req,res)=>res.json({user:publicUser(req.user!)}));
app.get("/api/lessons",requireAuth,(req,res)=>{
  const lessons=db.prepare(`SELECT l.id,l.track,l.title,l.slug,l.content,l.position,
    EXISTS(SELECT 1 FROM lesson_progress p WHERE p.lesson_id=l.id AND p.user_id=?) completed,
    (SELECT COUNT(*) FROM quiz_questions q WHERE q.lesson_id=l.id) question_count
    FROM lessons l WHERE l.disabled=0 ORDER BY l.position`).all(req.user!.id);
  res.json({lessons});
});
app.get("/api/lessons/:id",requireAuth,(req,res)=>{
  const lesson=db.prepare("SELECT id,track,title,slug,content,position FROM lessons WHERE id=? AND disabled=0").get(req.params.id);
  if(!lesson)return fail(res,404,"Lesson not found","NOT_FOUND");
  const questions=(db.prepare("SELECT id,question,options FROM quiz_questions WHERE lesson_id=?").all(req.params.id) as Array<{id:number;question:string;options:string}>).map(q=>({...q,options:JSON.parse(q.options)}));
  res.json({lesson,questions});
});
app.post("/api/lessons/:id/quiz",requireAuth,(req,res)=>{
  const schema=z.object({answers:z.record(z.number().int().min(0).max(10))});
  const parsed=schema.safeParse(req.body);if(!parsed.success)return fail(res,400,"Invalid quiz response","VALIDATION_ERROR");
  const qs=db.prepare("SELECT id,answer,explanation FROM quiz_questions WHERE lesson_id=?").all(req.params.id) as Array<{id:number;answer:number;explanation:string}>;
  if(!qs.length)return fail(res,404,"Lesson quiz not found","NOT_FOUND");
  const score=qs.filter(q=>parsed.data.answers[String(q.id)]===q.answer).length;
  const passed=score>=2;
  let reward=0;
  if(passed){
    const exists=db.prepare("SELECT 1 FROM lesson_progress WHERE user_id=? AND lesson_id=?").get(req.user!.id,req.params.id);
    db.prepare("INSERT OR IGNORE INTO lesson_progress(user_id,lesson_id,score) VALUES(?,?,?)").run(req.user!.id,req.params.id,score);
    if(!exists){reward=50;awardXp(req.user!.id,reward,"lesson_completed",`Completed a lesson quiz (${score}/${qs.length})`);}
  }
  res.json({score,total:qs.length,passed,reward,explanations:qs.map(q=>({questionId:q.id,correct:parsed.data.answers[String(q.id)]===q.answer,explanation:q.explanation}))});
});
app.get("/api/labs",requireAuth,(req,res)=>{
  const labs=db.prepare(`SELECT l.id,l.title,l.slug,l.category,l.difficulty,l.description,l.points,
   EXISTS(SELECT 1 FROM lab_solves s WHERE s.user_id=? AND s.lab_id=l.id) solved,
   (SELECT COUNT(*) FROM lab_hints h WHERE h.lab_id=l.id) hint_count
   FROM labs l WHERE l.disabled=0 ORDER BY l.id`).all(req.user!.id);
  res.json({labs});
});
app.get("/api/labs/:id",requireAuth,(req,res)=>{
  const lab=db.prepare("SELECT id,title,slug,category,difficulty,description,points FROM labs WHERE id=? AND disabled=0").get(req.params.id);
  if(!lab)return fail(res,404,"Lab not found","NOT_FOUND");
  const hints=db.prepare(`SELECT h.id,h.position,u.hint_id IS NOT NULL unlocked,
    CASE WHEN u.hint_id IS NOT NULL THEN h.body ELSE NULL END body
    FROM lab_hints h LEFT JOIN hint_unlocks u ON u.hint_id=h.id AND u.user_id=?
    WHERE h.lab_id=? ORDER BY h.position`).all(req.user!.id,req.params.id);
  const solved=db.prepare("SELECT points_awarded FROM lab_solves WHERE user_id=? AND lab_id=?").get(req.user!.id,req.params.id);
  res.json({lab,hints,solved:Boolean(solved)});
});
app.post("/api/labs/:id/hints/:hintId",requireAuth,(req,res)=>{
  const hint=db.prepare("SELECT h.id,h.body,h.lab_id FROM lab_hints h JOIN labs l ON l.id=h.lab_id WHERE h.id=? AND h.lab_id=? AND l.disabled=0").get(req.params.hintId,req.params.id) as {id:number;body:string;lab_id:number}|undefined;
  if(!hint)return fail(res,404,"Hint not found","NOT_FOUND");
  db.prepare("INSERT OR IGNORE INTO hint_unlocks(user_id,lab_id,hint_id) VALUES(?,?,?)").run(req.user!.id,hint.lab_id,hint.id);
  res.json({hint:hint.body});
});
app.post("/api/labs/:id/submit",requireAuth,(req,res)=>{
  const parsed=z.object({flag:z.string().trim().min(1).max(200)}).safeParse(req.body);
  if(!parsed.success)return fail(res,400,"Enter a flag","VALIDATION_ERROR");
  const lab=db.prepare("SELECT id,title,points,flag_hash FROM labs WHERE id=? AND disabled=0").get(req.params.id) as {id:number;title:string;points:number;flag_hash:string}|undefined;
  if(!lab)return fail(res,404,"Lab not found","NOT_FOUND");
  if(!verifyFlag(parsed.data.flag,lab.flag_hash))return res.status(400).json({error:{message:"That flag is not correct yet","code":"INCORRECT_FLAG"}});
  const solved=db.prepare("SELECT 1 FROM lab_solves WHERE user_id=? AND lab_id=?").get(req.user!.id,lab.id);
  if(solved)return res.json({correct:true,alreadySolved:true,points:0});
  const hints=(db.prepare("SELECT COUNT(*) AS n FROM hint_unlocks WHERE user_id=? AND lab_id=?").get(req.user!.id,lab.id) as {n:number}).n;
  const points=hintAdjustedPoints(lab.points,hints);
  db.prepare("INSERT INTO lab_solves(user_id,lab_id,points_awarded) VALUES(?,?,?)").run(req.user!.id,lab.id,points);
  awardXp(req.user!.id,points,"lab_solved",`Solved ${lab.title} for ${points} XP`);
  res.json({correct:true,alreadySolved:false,points});
});
app.post("/api/labs/:id/simulate",requireAuth,(req,res)=>{
  const lab=db.prepare("SELECT slug FROM labs WHERE id=? AND disabled=0").get(req.params.id) as {slug:string}|undefined;
  if(!lab)return fail(res,404,"Lab not found","NOT_FOUND");
  const input=z.object({input:z.string().max(500)}).safeParse(req.body);
  if(!input.success)return fail(res,400,"Simulation input is too long","VALIDATION_ERROR");
  const value=input.data.input;
  const results:Record<string,unknown>={
    "sqli-login-simulated":{...fakeSqlLogin(value,"not-the-password"),message:"Offline toy parser response; no database query was executed."},
    "stored-xss-guestbook-simulated":{detected:/<\s*script|onerror\s*=|javascript:/i.test(value),executed:false,message:"Inert detector only: input is not persisted, rendered, or executed."},
    "idor-invoice-viewer-simulated":{invoice:value==="1001"?{id:1001,owner:"you",total:"$24.00"}:value==="1002"?{id:1002,owner:"demo-colleague",total:"$87.00"}:null,authorization:"The deliberately simplified demo endpoint illustrates why ownership must be checked."}
  };
  const result=results[lab.slug];
  if(!result)return fail(res,400,"This lab has no interactive simulation","INVALID_LAB");
  res.json({result});
});
app.post("/api/arena/start",requireAuth,(req,res)=>{
  const qs=db.prepare(`SELECT q.id,q.question,q.options,l.title AS lesson FROM quiz_questions q JOIN lessons l ON l.id=q.lesson_id ORDER BY RANDOM() LIMIT 10`).all() as Array<{id:number;question:string;options:string;lesson:string}>;
  if(!qs.length)return fail(res,503,"Arena questions are not available yet","NOT_READY");
  const start=Date.now();
  const run=db.prepare("INSERT INTO arena_runs(user_id,questions,started_at) VALUES(?,?,?)").run(req.user!.id,JSON.stringify(qs.map(q=>q.id)),start);
  res.status(201).json({runId:Number(run.lastInsertRowid),startedAt:start,questions:qs.map(q=>({id:q.id,question:q.question,options:JSON.parse(q.options),lesson:q.lesson}))});
});
app.post("/api/arena/:id/answer",requireAuth,(req,res)=>{
  const parsed=z.object({questionId:z.number().int().positive(),choice:z.number().int().min(0).max(10).nullable()}).safeParse(req.body);
  if(!parsed.success)return fail(res,400,"Invalid arena answer","VALIDATION_ERROR");
  const run=db.prepare("SELECT * FROM arena_runs WHERE id=? AND user_id=?").get(req.params.id,req.user!.id) as {id:number;questions:string;started_at:number;finished_at:number|null}|undefined;
  if(!run)return fail(res,404,"Arena run not found","NOT_FOUND");
  if(run.finished_at)return fail(res,409,"This round has already finished","ALREADY_FINISHED");
  const ids=JSON.parse(run.questions) as number[];
  const questionIndex=ids.indexOf(parsed.data.questionId);
  if(questionIndex<0)return fail(res,400,"Question is not part of this round","INVALID_QUESTION");
  if(db.prepare("SELECT 1 FROM arena_answers WHERE run_id=? AND question_id=?").get(run.id,parsed.data.questionId))return fail(res,409,"This question was already submitted","ALREADY_ANSWERED");
  const prior=db.prepare("SELECT MAX(answered_at) AS answered_at FROM arena_answers WHERE run_id=?").get(run.id) as {answered_at:number|null};
  const expectedQuestion=ids.find(id=>!db.prepare("SELECT 1 FROM arena_answers WHERE run_id=? AND question_id=?").get(run.id,id));
  if(expectedQuestion!==parsed.data.questionId)return fail(res,400,"Submit arena questions in order","INVALID_QUESTION_ORDER");
  const questionStarted=prior.answered_at??run.started_at;
  const now=Date.now();
  const timedOut=now-questionStarted>=20000;
  const choice=timedOut?null:parsed.data.choice;
  db.prepare("INSERT INTO arena_answers(run_id,question_id,choice,answered_at,timed_out) VALUES(?,?,?,?,?)").run(run.id,parsed.data.questionId,choice,now,Number(timedOut));
  res.json({accepted:!timedOut&&choice!==null,timedOut});
});
app.post("/api/arena/:id/finish",requireAuth,(req,res)=>{
  const parsed=z.object({}).safeParse(req.body);
  if(!parsed.success)return fail(res,400,"Invalid arena answers","VALIDATION_ERROR");
  const run=db.prepare("SELECT * FROM arena_runs WHERE id=? AND user_id=?").get(req.params.id,req.user!.id) as {id:number;questions:string;started_at:number;finished_at:number|null}|undefined;
  if(!run)return fail(res,404,"Arena run not found","NOT_FOUND");
  if(run.finished_at)return fail(res,409,"This round has already been submitted","ALREADY_FINISHED");
  const ids=JSON.parse(run.questions) as number[];
  const now=Date.now();
  const elapsed=Math.max(0,now-run.started_at);
  const stored=db.prepare("SELECT a.question_id,a.choice,a.answered_at,a.timed_out,q.answer FROM arena_answers a JOIN quiz_questions q ON q.id=a.question_id WHERE a.run_id=?").all(run.id) as Array<{question_id:number;choice:number|null;answered_at:number;timed_out:number;answer:number}>;
  const score=stored.filter(a=>a.choice!==null&&!a.timed_out&&a.choice===a.answer).length;
  const speedBonus=stored.filter(a=>a.choice!==null&&!a.timed_out&&a.choice===a.answer&&a.answered_at-(stored.find(previous=>ids.indexOf(previous.question_id)===ids.indexOf(a.question_id)-1)?.answered_at??run.started_at)<=10000).length;
  const personal=(db.prepare("SELECT MAX(score) AS best FROM arena_runs WHERE user_id=? AND finished_at IS NOT NULL").get(req.user!.id) as {best:number|null}).best??0;
  const isBest=score>personal;
  db.prepare("UPDATE arena_runs SET finished_at=?,score=? WHERE id=?").run(now,score,run.id);
  const xp=isBest?score*10+speedBonus*2:0;
  if(xp)awardXp(req.user!.id,xp,"arena_best",`New arena best: ${score}/10`);
  res.json({score,total:ids.length,personalBest:Math.max(personal,score),isBest,xp,speedBonus,elapsedMs:elapsed});
});
app.get("/api/arena/best",requireAuth,(req,res)=>res.json({best:(db.prepare("SELECT MAX(score) AS best FROM arena_runs WHERE user_id=? AND finished_at IS NOT NULL").get(req.user!.id) as {best:number|null}).best??0}));
app.get("/api/leaderboard",requireAuth,(_req,res)=>{
  const rows=db.prepare("SELECT id,username,xp,streak FROM users WHERE disabled=0 ORDER BY xp DESC,username COLLATE NOCASE LIMIT 50").all() as Array<{id:number;username:string;xp:number;streak:number}>;
  res.json({users:rows.map((u,i)=>({...u,rank:i+1,level:levelForXp((u as {xp:number}).xp)}))});
});
app.get("/api/profile",requireAuth,(req,res)=>{
  const badges=db.prepare("SELECT badge_key,earned_at FROM badges_earned WHERE user_id=? ORDER BY earned_at DESC").all(req.user!.id);
  const activity=db.prepare("SELECT action,detail,created_at FROM activity_log WHERE user_id=? ORDER BY created_at DESC LIMIT 12").all(req.user!.id);
  const tracks=db.prepare(`SELECT track,COUNT(*) total,SUM(CASE WHEN p.user_id=? THEN 1 ELSE 0 END) completed FROM lessons l LEFT JOIN lesson_progress p ON p.lesson_id=l.id GROUP BY track`).all(req.user!.id);
  res.json({user:publicUser(req.user!),badges,activity,tracks});
});
app.post("/api/profile/tool-used",requireAuth,(req,res)=>{
  db.prepare("INSERT OR IGNORE INTO badges_earned(user_id,badge_key) VALUES(?,'toolsmith')").run(req.user!.id);
  res.json({ok:true});
});
app.put("/api/profile/password",requireAuth,asyncRoute(async(req,res)=>{
  const parsed=z.object({currentPassword:z.string().min(1),newPassword:z.string().min(10).max(128)}).safeParse(req.body);
  if(!parsed.success)return fail(res,400,"New password must be at least 10 characters","VALIDATION_ERROR");
  const row=db.prepare("SELECT password_hash FROM users WHERE id=?").get(req.user!.id) as {password_hash:string};
  if(!(await bcrypt.compare(parsed.data.currentPassword,row.password_hash)))return fail(res,400,"Current password is incorrect","INVALID_PASSWORD");
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(await bcrypt.hash(parsed.data.newPassword,12),req.user!.id);
  res.json({ok:true});
}));
app.delete("/api/profile",requireAuth,asyncRoute(async(req,res)=>{
  const parsed=z.object({password:z.string().min(1)}).safeParse(req.body);
  if(!parsed.success)return fail(res,400,"Confirm your password to delete the account","VALIDATION_ERROR");
  const row=db.prepare("SELECT password_hash FROM users WHERE id=?").get(req.user!.id) as {password_hash:string};
  if(!(await bcrypt.compare(parsed.data.password,row.password_hash)))return fail(res,400,"Password is incorrect","INVALID_PASSWORD");
  db.prepare("DELETE FROM users WHERE id=?").run(req.user!.id);
  res.clearCookie(cookieName,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production"}).json({ok:true});
}));
app.get("/api/admin/stats",requireAuth,requireAdmin,(_req,res)=>res.json({
 users:(db.prepare("SELECT COUNT(*) n FROM users").get() as {n:number}).n,
 lessons:(db.prepare("SELECT COUNT(*) n FROM lessons WHERE disabled=0").get() as {n:number}).n,
 labs:(db.prepare("SELECT COUNT(*) n FROM labs WHERE disabled=0").get() as {n:number}).n,
 solves:(db.prepare("SELECT COUNT(*) n FROM lab_solves").get() as {n:number}).n
}));
app.get("/api/admin/users",requireAuth,requireAdmin,(_req,res)=>res.json({users:db.prepare("SELECT id,username,email,role,xp,disabled,created_at FROM users ORDER BY id").all()}));
app.get("/api/admin/labs",requireAuth,requireAdmin,(_req,res)=>res.json({labs:db.prepare("SELECT id,title,slug,category,difficulty,description,points,disabled FROM labs ORDER BY id").all()}));
app.post("/api/admin/labs",requireAuth,requireAdmin,(req,res)=>{
  const schema=z.object({title:z.string().min(3).max(100),category:z.enum(["Web","Crypto","Network"]),difficulty:z.enum(["Easy","Medium"]),description:z.string().min(10).max(2000),flag:z.string().regex(/^WD\{[a-zA-Z0-9_-]+\}$/),points:z.number().int().min(40).max(1000),hint:z.string().max(1000).optional()});
  const parsed=schema.safeParse(req.body);if(!parsed.success)return fail(res,400,"Invalid lab fields","VALIDATION_ERROR");
  const {title,category,difficulty,description,flag,points,hint}=parsed.data;
  try {
    const create=db.transaction(()=>{
      const slug=title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")+"-"+Date.now().toString(36);
      const result=db.prepare("INSERT INTO labs(title,slug,category,difficulty,description,flag_hash,points) VALUES(?,?,?,?,?,?,?)").run(title,slug,category,difficulty,description,hashFlag(flag),points);
      if(hint)db.prepare("INSERT INTO lab_hints(lab_id,body,position) VALUES(?,?,1)").run(Number(result.lastInsertRowid),hint);
      return Number(result.lastInsertRowid);
    });
    return res.status(201).json({id:create()});
  } catch(error){console.error("Admin lab creation failed:",error);return fail(res,500,"Unable to create lab","DATABASE_ERROR");}
});
app.patch("/api/admin/labs/:id",requireAuth,requireAdmin,(req,res)=>{
  const parsed=z.object({title:z.string().min(3).max(100).optional(),description:z.string().min(10).max(2000).optional(),points:z.number().int().min(40).max(1000).optional(),disabled:z.boolean().optional(),flag:z.string().regex(/^WD\{[a-zA-Z0-9_-]+\}$/).optional()}).safeParse(req.body);
  if(!parsed.success||Object.keys(parsed.data??{}).length===0)return fail(res,400,"Invalid lab update","VALIDATION_ERROR");
  const data=parsed.data;
  const found=db.prepare("SELECT id FROM labs WHERE id=?").get(req.params.id);if(!found)return fail(res,404,"Lab not found","NOT_FOUND");
  const update=db.prepare("UPDATE labs SET title=COALESCE(?,title),description=COALESCE(?,description),points=COALESCE(?,points),disabled=COALESCE(?,disabled),flag_hash=COALESCE(?,flag_hash) WHERE id=?");
  update.run(data.title??null,data.description??null,data.points??null,data.disabled===undefined?null:Number(data.disabled),data.flag?hashFlag(data.flag):null,req.params.id);
  res.json({ok:true});
});
app.get("/api/admin/lessons",requireAuth,requireAdmin,(_req,res)=>res.json({lessons:db.prepare("SELECT id,track,title,slug,content,position,disabled FROM lessons ORDER BY position").all()}));
app.post("/api/admin/lessons",requireAuth,requireAdmin,(req,res)=>{
  const question=z.object({question:z.string().min(10).max(500),options:z.array(z.string().min(1).max(200)).length(3),answer:z.number().int().min(0).max(2),explanation:z.string().min(5).max(500)});
  const parsed=z.object({track:z.enum(["Foundations","Web Security","Network Security","Crypto and Defence"]),title:z.string().min(3).max(100),content:z.string().min(20).max(10000),questions:z.array(question).length(3)}).safeParse(req.body);
  if(!parsed.success)return fail(res,400,"Invalid lesson fields","VALIDATION_ERROR");
  const slug=parsed.data.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")+"-"+Date.now().toString(36);
  const create=db.transaction(()=>{
    const result=db.prepare("INSERT INTO lessons(track,title,slug,content,position) VALUES(?,?,?,?,(SELECT COALESCE(MAX(position),0)+1 FROM lessons))").run(parsed.data.track,parsed.data.title,slug,parsed.data.content);
    const add=db.prepare("INSERT INTO quiz_questions(lesson_id,question,options,answer,explanation) VALUES(?,?,?,?,?)");
    for(const q of parsed.data.questions)add.run(Number(result.lastInsertRowid),q.question,JSON.stringify(q.options),q.answer,q.explanation);
    return Number(result.lastInsertRowid);
  });
  const id=create();
  res.status(201).json({id});
});
app.patch("/api/admin/lessons/:id",requireAuth,requireAdmin,(req,res)=>{
  const parsed=z.object({title:z.string().min(3).max(100).optional(),content:z.string().min(20).max(10000).optional(),disabled:z.boolean().optional()}).safeParse(req.body);
  if(!parsed.success||!Object.keys(parsed.data??{}).length)return fail(res,400,"Invalid lesson update","VALIDATION_ERROR");
  const d=parsed.data;
  const result=db.prepare("UPDATE lessons SET title=COALESCE(?,title),content=COALESCE(?,content),disabled=COALESCE(?,disabled) WHERE id=?").run(d.title??null,d.content??null,d.disabled===undefined?null:Number(d.disabled),req.params.id);
  return result.changes?res.json({ok:true}):fail(res,404,"Lesson not found","NOT_FOUND");
});
app.post("/api/admin/users/:id/reset-progress",requireAuth,requireAdmin,(req,res)=>{
  const id=Number(req.params.id);if(!Number.isInteger(id)||!db.prepare("SELECT 1 FROM users WHERE id=?").get(id))return fail(res,404,"User not found","NOT_FOUND");
  const reset=db.transaction(()=>{for(const table of ["lesson_progress","lab_solves","hint_unlocks","arena_runs","badges_earned","activity_log"])db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(id);db.prepare("UPDATE users SET xp=0,streak=0,last_active=NULL WHERE id=?").run(id);});
  reset();res.json({ok:true});
});
app.use("/api",(_req,res)=>fail(res,404,"API route not found","NOT_FOUND"));
const clientDist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../client/dist");
if(existsSync(clientDist)){
  app.use(express.static(clientDist,{index:false}));
  app.get("*",(_req,res)=>res.sendFile(path.join(clientDist,"index.html")));
}
app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
  console.error("API error:",error);
  if(error instanceof SyntaxError)return fail(res,400,"Malformed JSON request","INVALID_JSON");
  return fail(res,500,"An unexpected server error occurred","INTERNAL_ERROR");
});

export { app };
