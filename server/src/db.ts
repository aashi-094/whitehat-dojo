import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export const dbPath = process.env.DATABASE_PATH ?? path.resolve("whitehat-dojo.sqlite");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
export const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
 xp INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, last_active TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, disabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS lessons (
 id INTEGER PRIMARY KEY, track TEXT NOT NULL, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
 content TEXT NOT NULL, position INTEGER NOT NULL, disabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS quiz_questions (
 id INTEGER PRIMARY KEY, lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
 question TEXT NOT NULL, options TEXT NOT NULL, answer INTEGER NOT NULL, explanation TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lesson_progress (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
 completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, score INTEGER NOT NULL,
 PRIMARY KEY(user_id, lesson_id)
);
CREATE TABLE IF NOT EXISTS labs (
 id INTEGER PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, category TEXT NOT NULL,
 difficulty TEXT NOT NULL, description TEXT NOT NULL, flag_hash TEXT NOT NULL,
 points INTEGER NOT NULL, disabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS lab_hints (
 id INTEGER PRIMARY KEY, lab_id INTEGER NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
 body TEXT NOT NULL, position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lab_solves (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 lab_id INTEGER NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
 points_awarded INTEGER NOT NULL, solved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id, lab_id)
);
CREATE TABLE IF NOT EXISTS hint_unlocks (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 lab_id INTEGER NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
 hint_id INTEGER NOT NULL REFERENCES lab_hints(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id, hint_id)
);
CREATE TABLE IF NOT EXISTS arena_runs (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 questions TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER,
 score INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS arena_answers (
 run_id INTEGER NOT NULL REFERENCES arena_runs(id) ON DELETE CASCADE,
 question_id INTEGER NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
 choice INTEGER,
 answered_at INTEGER NOT NULL,
 timed_out INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(run_id, question_id)
);
CREATE TABLE IF NOT EXISTS badges_earned (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 badge_key TEXT NOT NULL, earned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id, badge_key)
);
CREATE TABLE IF NOT EXISTS activity_log (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lessons_track_position ON lessons(track, position);
CREATE INDEX IF NOT EXISTS idx_questions_lesson ON quiz_questions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_solves_user ON lab_solves(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_user_date ON activity_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users(username COLLATE NOCASE);
`);
