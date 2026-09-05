# Developer Assessment & Coding Platform — Backend

REST API for a technical recruitment and coding assessment platform: companies create assessments, manage problem banks (MCQs, written, and coding challenges), invite developer candidates, run timed assessments, evaluate submissions, and generate candidate reports.

**Stack:** Node.js · Express 5 · TypeScript · Prisma 7 · PostgreSQL · JWT Authentication

---

## 1. Project Overview

The **Developer Assessment & Coding Platform** provides a centralized backend to evaluate developer candidates through:
- **Problem Bank**: Reusable questions categorized by MCQ, Written (theory), and Coding questions with test cases.
- **Assessments**: Timed coding assessments configured with custom durations, passing scores, question ordering, and anti-cheating rules.
- **Candidate Invitations & Attempts**: Unique token-based invitations, server-enforced timers, and attempt lifecycle management.
- **Submissions & Evaluations**: Automatic grading for MCQs, code execution tracking for coding problems, and evaluator workflows for written answers.
- **Results & Reports**: Candidate scoring, ranking, pass/fail status, and company-level assessment analytics.

---

## 2. Prerequisites

| Tool | Version | Check with |
| --- | --- | --- |
| **Node.js** | 20+ | `node -v` |
| **PostgreSQL** | 14+ | `psql -V` |

---

## 3. Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Ensure `DATABASE_URL` is configured for your PostgreSQL instance:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/developer_assessment_platform?schema=public"
```

### 3. Validate and Generate Prisma Client
```bash
# Validate Prisma schema
npm run prisma:validate

# Generate Prisma Client
npm run prisma:generate
```

### 4. Run Migrations
```bash
npx prisma migrate dev --name init
```

### 5. Start the Development Server
```bash
npm run dev
```

---

## 4. API Endpoints (Current & Planned)

### Authentication (`/api/v1/auth`)
- `POST /api/v1/auth/register` — Register a new candidate / user
- `POST /api/v1/auth/login` — Log in and receive access/refresh tokens
- `GET  /api/v1/auth/me` — Fetch current user profile
- `POST /api/v1/auth/refresh-token` — Rotate access token

### Companies & Members (`/api/v1/companies`)
- Company creation, member management, and role-based permissions (Owner, Admin, Creator, Evaluator).

### Problem Bank (`/api/v1/problems`)
- Create and manage MCQ, Written, and Coding problems with public & hidden test cases.

### Assessments & Invitations (`/api/v1/assessments`)
- Configure assessments, problem associations, invite candidates, and track attempts.

### Submissions & Evaluations (`/api/v1/submissions`)
- Track candidate answers, code execution, automatic scoring, and manual evaluation feedback.

---

## 5. Scripts

- `npm run dev`: Start dev server with `tsx watch`
- `npm run build`: Compile TypeScript with `tsc`
- `npm run prisma:validate`: Validate Prisma multi-schema files
- `npm run prisma:generate`: Generate typed Prisma client into `src/generated/prisma`
- `npm run format:fix`: Format source code using Biome
- `npm run lint:check`: Run linter checks using Biome
