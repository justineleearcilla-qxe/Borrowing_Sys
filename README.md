# EquipHub - College Equipment Borrowing System

A full-stack web application for managing equipment loans within a single college/school. Students and faculty browse equipment and submit borrow requests; staff/admins approve requests, manage inventory, use a manual check-out/return desk, and export reports.

## Tech Stack

| Layer         | Technology                                                          |
| ------------- | ------------------------------------------------------------------- |
| Frontend      | React 18 (Vite) + TypeScript + Tailwind CSS                         |
| Backend       | Node.js + Express (REST API, TypeScript)                            |
| Database      | PostgreSQL                                                          |
| ORM           | Prisma                                                              |
| Auth          | JWT + bcrypt hashing + role-based access (STUDENT/FACULTY vs ADMIN) |
| Files         | multer (image uploads)                                               |
| Notifications | Nodemailer (due-date reminders, overdue notices)                    |
| Reports       | exceljs (Excel) + pdfkit (PDF)                                      |
| Scheduling    | node-cron (hourly overdue sweep + reminders)                        |
| Deployment    | Dockerfile + docker-compose (db + backend + frontend)               |

## Features

- **Equipment categories** - Sports, Laboratory, AV/Multimedia, Computer/IT, Musical Instruments, Event/Facility - each with its own icon and filtered view.
- **Borrowing workflow** - Pending -> Approved -> Borrowed -> Returned, plus Rejected and auto-flagged Overdue. Admins can add remarks on approve/reject.
- **Inventory management** - CRUD items with total/available quantity, condition (New/Good/Damaged), status (Available/Under Maintenance/Retired), owning department, photo upload.
- **Due dates & reminders** - Hourly cron flags overdue loans, emails reminders 48h before due date, adds penalty points per offense, and blacklists repeat late returners at 6 points.
- **Search & filter** - by name/code, category, availability, department.
- **Dashboards** - student: active loans, due-soon alerts, request history; admin: totals, borrowed/overdue counts, most-borrowed category chart, pending queue, low-stock alerts.
- **Manual check-out/return desk** - search by item name, item code, or borrower name; review open loans and process check-outs and returns.
- **Reports & analytics** - most borrowed items, frequency per department, damage/loss incidents - exportable to Excel and PDF.
- **Auth** - public catalog browsing with school-domain-restricted actions (`@school.edu`), JWT sessions, role-based routes.

## Project Structure

```
backend/
  prisma/
    schema.prisma        # User, Category, Item, Loan models
    seed.ts              # 6 categories, 23 items, 3 users, sample loans
  src/
    config/env.ts        # environment configuration
    lib/prisma.ts
    middleware/          # auth (JWT/admin), error handler, multer upload
    routes/              # auth, categories, items, loans, dashboard, reports
    services/            # mailer (nodemailer), cron (overdue sweep)
  uploads/               # equipment images (served at /uploads)
frontend/
  src/
    api/client.ts        # axios instance + helpers
    components/          # Layout, Icon, CategoryIcon, ui kit
    context/AuthContext.tsx
    pages/               # Login, Register, Dashboard, Catalog, ItemDetail, MyLoans
    pages/admin/         # Requests, Users, Inventory, Check-out desk, Reports
docker-compose.yml
```

## Quick Start (Docker)

Requires Docker Desktop. This starts PostgreSQL, applies migrations, and runs the API on port 4000 and web app on port 8080.

```bash
docker compose up --build
```

Then open http://localhost:8080

- The backend automatically runs `prisma migrate deploy` at startup. Run the seed separately with a private
  `SEED_USER_PASSWORD` of at least 16 characters; never use the seed script's accounts
  with a shared or publicly known password.

## Quick Start (Manual / Local Dev)

### 1. Prerequisites

- Node.js 18+ (Node 20 recommended)
- PostgreSQL running locally (any 14+)

### 2. Backend setup

```bash
cd backend
npm install
copy .env.example .env    # PowerShell: Copy-Item .env.example .env (then edit DATABASE_URL / JWT_SECRET if needed)
npx prisma migrate dev --name init   # creates schema
npm run seed                         # loads demo data; requires SEED_USER_PASSWORD in backend/.env
npm run dev                          # API on http://localhost:4000
```

If you already have a database from an older run you can also use `npx prisma migrate deploy` instead of `migrate dev`.

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev                # web app on http://localhost:5173 (proxies /api to :4000)
```

The seed creates sample accounts and loans for local development. Set secure credentials before using seeded accounts outside a local development environment.

## Environment Variables (backend/.env)

See `backend/.env.example`. Key variables:

- `DATABASE_URL` - PostgreSQL connection string.
- `JWT_SECRET`, `JWT_EXPIRES_IN` - token signing.
- `CLIENT_ORIGIN` - allowed CORS origins (comma-separated).
- `SCHOOL_EMAIL_DOMAIN` - school domain used for registration and login (default: `@school.edu`).
- `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` - email delivery. If `SMTP_HOST` is empty, all emails are logged to the API console instead (useful in dev).
- `UPLOAD_DIR` - where equipment photos are stored (default `uploads`).

## API Overview

All endpoints are prefixed with `/api`. Authenticated calls use `Authorization: Bearer <token>`.

| Method & Path                 | Access | Description                                        |
| ----------------------------- | ------ | -------------------------------------------------- |
| POST `/auth/register`         | public | Register (school domain enforced)                  |
| POST `/auth/login`            | public | Login, returns JWT                                 |
| GET `/auth/me`                | any    | Current user profile                               |
| GET `/categories`             | any    | Categories with item counts                        |
| GET `/items`                  | any    | List/filter/search items                           |
| GET `/items/:id`              | any    | Item detail                                        |
| POST/PUT/DELETE `/items...`   | admin  | Inventory CRUD                                     |
| POST `/items/:id/image`       | admin  | Upload photo (multipart field `image`)             |
| POST `/loans`                 | any    | Submit borrow request                              |
| GET `/loans/mine`             | any    | My requests                                        |
| DELETE `/loans/:id`           | owner  | Cancel own pending request                         |
| GET `/loans?status=`          | admin  | All requests                                       |
| PATCH `/loans/:id/decide`     | admin  | Approve/reject `{ action, remarks? }`              |
| PATCH `/loans/:id/checkout`   | admin  | Mark approved loan as borrowed (decrements stock)  |
| PATCH `/loans/:id/return`     | admin  | Return `{ outcome: OK/DAMAGED/LOST, note? }`       |
| POST `/loans/maintenance/run` | admin  | Trigger overdue sweep manually (for testing)       |
| GET `/dashboard`              | any    | Role-aware dashboard payload                       |
| GET `/reports/*`              | admin  | summary, most-borrowed, by-department, damage-loss |
| GET `/reports/export/excel`   | admin  | Full workbook download                             |
| GET `/reports/export/pdf`     | admin  | Full PDF report download                           |

## Design System Notes

- All corners are sharp: Tailwind's entire `borderRadius` scale is overridden to `0` and a global CSS rule enforces it, so no rounded corners can appear anywhere.
- Shared utility classes live in `frontend/src/index.css`: `.btn .btn-primary/.btn-secondary/.btn-danger/.btn-success/.btn-ghost`, `.card`, `.input/.select/.textarea`, `.badge-*`, `.th/.td`, `.nav-link`.
- Primary palette is an academic navy (`primary-*`) over slate neutrals; layout is responsive with a fixed sidebar on desktop and a drawer menu on mobile.

## Useful Commands

```bash
# Backend
npm run dev            # dev server with reload
npm run build && npm start
npx prisma studio      # inspect data

# Frontend
npm run dev            # vite dev server
npm run build          # typecheck + production build

# Docker
docker compose up --build
docker compose down -v # reset including database volume
```
