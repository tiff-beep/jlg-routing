# JLG Lead Routing Tool

## Setup Instructions

### Step 1 — Supabase (database)

1. Go to supabase.com and click **Start your project**
2. Sign up with GitHub or email
3. Click **New project** — name it `jlg-routing`, choose a region (US East), set a password, click **Create**
4. Wait ~2 minutes for it to spin up
5. Go to **SQL Editor** (left sidebar) → **New query**
6. Copy the contents of `supabase-setup.sql` and paste it in, then click **Run**
7. Go to **Project Settings** → **API**
8. Copy: **Project URL** and **anon public** key — you will need both in Step 3

### Step 2 — GitHub

1. Go to github.com and sign up / sign in
2. Click **New repository** → name it `jlg-routing` → **Create repository**
3. On your computer, open Terminal and run:

```bash
cd path/to/jlg-routing
git init
git add .
git commit -m "initial"
git remote add origin https://github.com/YOUR_USERNAME/jlg-routing.git
git push -u origin main
```

### Step 3 — Vercel (hosting)

1. Go to vercel.com and sign up with GitHub
2. Click **Add New Project** → import your `jlg-routing` repo
3. Before clicking Deploy, expand **Environment Variables** and add:
   - Name: `NEXT_PUBLIC_SUPABASE_URL`  /  Value: your Project URL from Step 1
   - Name: `NEXT_PUBLIC_SUPABASE_ANON_KEY`  /  Value: your anon key from Step 1
4. Click **Deploy**
5. Vercel gives you a URL like `jlg-routing.vercel.app` — share this with your team

### Step 4 — Done

Every ISA and OSA opens the same URL. Rotation state is shared in real time.

---

## Monthly reset

Go to your Supabase dashboard → SQL Editor → run:
```sql
delete from lead_log;
```
Then open the tool — it will re-seed with the default rotation for the new month.
