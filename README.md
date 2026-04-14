# Receipt App

A simple two-user receipt app for phone-first capture.

## What this version does

- Magic-link email sign-in with Supabase Auth
- One shared workspace
- Owner + Submitter roles
- Submitter can do quick mobile receipt capture
- Owner can review and approve
- Receipt image upload to Supabase Storage
- Shared receipt list and totals

## Before deploy

### 1. Supabase
Create a Supabase project, then:

- Create a storage bucket named `receipt-images`
- In SQL Editor, run `supabase-setup.sql`
- In Authentication, enable Email sign-in

### 2. Vercel environment variables
Add these in Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Use `.env.example` as a reference.

## Deploy on Vercel

This is a standard Vite app.

- Framework preset: `Vite`
- Root directory: `./`
- Build command: `vite build`

## First-time workspace setup

After both users log in once, use Supabase SQL Editor.

### Create one workspace

```sql
insert into workspaces (name)
values ('Farm')
returning id;
```

### Add yourself as owner

```sql
insert into workspace_members (workspace_id, user_id, role)
values ('WORKSPACE_ID', 'YOUR_USER_ID', 'Owner');
```

### Add your wife as submitter

```sql
insert into workspace_members (workspace_id, user_id, role)
values ('WORKSPACE_ID', 'HER_USER_ID', 'Submitter');
```

You can get user IDs from Supabase Authentication -> Users.

## Local development

```bash
npm install
npm run dev
```
