# Whitehat Dojo

Whitehat Dojo is an ethical-cybersecurity learning platform for practicing in a controlled, permission-first environment. Its CTF targets are deliberately isolated toy simulations: submitted strings are parsed as data, no user code is executed, and no user-provided host is contacted.

## Requirements

- Node.js 20 or newer (tested here with Node.js 24)
- npm 10 or newer

## Quick start

From the repository root:

```sh
npm install
```

Copy `.env.example` to `server/.env` and replace `JWT_SECRET` with a random secret of at least 32 characters before exposing the app beyond your development machine. The frontend defaults to the local API; for a different API origin, copy `client/.env.example` to `client/.env.local` and set `VITE_API_URL`. Then start both workspaces:

```sh
npm run dev
```

The development command seeds the SQLite database if necessary, then starts the API at `http://localhost:4000` and the Vite app at `http://localhost:5173`. The database file is created at `server/whitehat-dojo.sqlite`; override it with `DATABASE_PATH` in `server/.env`.

Seed or refresh reference content separately at any time:

```sh
npm run seed
```

The seed is idempotent for built-in lessons, questions, labs, and the initial administrator. Seeded flags are SHA-256 hashed before insertion. The seed command prints the initial administrator credentials only when making the first account:

- Username: `admin`
- Email: `admin@whitehatdojo.local`
- Password: `ChangeMe123!`

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `server/.env` **before the first seed** to choose different credentials. Change the initial password after signing in; do not use the development defaults in a deployed environment.

## Production build and tests

```sh
npm run build
npm test
```

To run the production app as one service, build first and start the compiled server with `npm run start -w server`. The server serves `client/dist` and the `/api` endpoints from the same origin. For a separate frontend host, set `VITE_API_URL` at client build time and configure the API's `CLIENT_ORIGIN`.

## Public deployment (GitHub + Render)

The repository includes a Render Blueprint in `render.yaml` for deploying the full-stack app on one origin. The Express server serves the production React build and `/api`; the free demo stores SQLite in temporary instance storage. Render free web services may sleep when idle and their local data is not persistent, so accounts and progress can be lost after a restart, sleep, or redeploy. For persistent production data, use a paid Render service with a persistent disk or migrate to a managed database.

1. Create a **public** GitHub repository and push this project to its default branch. Do not commit `.env` files, database files, passwords, or signing secrets.
2. In Render, choose **New + → Blueprint**, connect the GitHub repository, and apply the `render.yaml` configuration.
   The build command installs development dependencies explicitly because the TypeScript compiler and type declarations are required to build the server.
3. The configured public URL is `https://whitehat-dojo-live.onrender.com`. If that Render service name is unavailable, change `name` and the matching `CLIENT_ORIGIN` value in `render.yaml` to an available name before deploying.
4. Render generates `JWT_SECRET` and `ADMIN_PASSWORD`. After the initial deploy, view the generated `ADMIN_PASSWORD` in the Render service's environment settings and sign in as username `admin`; change the password immediately. Production seed output deliberately does not print credentials.
5. Wait for `/api/health` to pass, then open the service URL. Subsequent pushes to the connected branch deploy automatically.

The free demo Blueprint is for a single server instance; do not scale this SQLite deployment horizontally.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Express API port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | The single permitted browser origin |
| `JWT_SECRET` | Development-only fallback | JWT signing secret; production startup requires a unique value of 32+ characters |
| `DATABASE_PATH` | `./whitehat-dojo.sqlite` | SQLite database path, relative to the server workspace |
| `ADMIN_EMAIL` | `admin@whitehatdojo.local` | Initial seed administrator's email |
| `ADMIN_PASSWORD` | `ChangeMe123!` | Initial seed administrator's password |

The auth cookie is HTTP-only, SameSite=Lax, and Secure in production. Passwords are stored as bcrypt hashes. Public API errors use `{ "error": { "message": "...", "code": "..." } }`.

## Features

- Signup requires the explicit written-permission pledge. Login accepts username or email. Profile tools support password change, account deletion, progress, streak, activity, and badges.
- Four written learning tracks contain 12 lessons and three-question quizzes. Passing at least two questions completes a lesson and awards XP once.
- Eleven Web, Crypto, and Network labs use SHA-256-only flag storage, server-side flag verification, per-user solves, and hints with a 20% per-hint points penalty and a 40% floor.
- SQL injection, stored-XSS detection, and invoice-IDOR exercises use fixed in-memory toy behavior only. SQL is never assembled from submitted data; scripts are never run; lab interactions make no outbound host requests.
- The timed arena selects ten lesson questions per round, enforces a 20-second window for each answer, applies a speed bonus, and awards XP only for beating a personal best.
- Browser-only Base64, URL, hex, binary, ROT13/Caesar, hashing, password-estimation, JWT-inspection, HTTP-header, and common-port tools. User-entered tool content is not submitted to the API.
- XP, levels, learning streaks, milestone badges, recent activity, a progress dashboard, and a database-backed leaderboard.
- Admin-only user and platform statistics, lesson/lab create/edit/disable controls, and user-progress reset.
- Light, dark, and system themes; responsive desktop sidebar and mobile tab navigation; labelled forms, keyboard focus states, and live result announcements.

## Safety and scope

Only test systems you own or have written permission to test. The simulated challenges are for learning safe defensive concepts; they are not permission to probe any real service. The course covers ethical practice and the India Information Technology Act, 2000. This platform is educational material, not legal advice.
