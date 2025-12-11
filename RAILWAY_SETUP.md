# PubFlow AI - Railway Setup Guide

Your Railway project has been created! Follow these steps to complete the deployment.

**Project URL:** https://railway.com/project/2d7e7757-5a4e-4653-b986-3cd98280a637

---

## Step 1: Add Database Services (Railway Dashboard)

1. In the Railway dashboard, click **"+ New"** button
2. Add **PostgreSQL** database
3. Click **"+ New"** again
4. Add **Redis** database

---

## Step 2: Enable pgvector Extension

1. Click on the PostgreSQL service
2. Go to **Data** tab
3. Click **Connect** or use the connection string
4. Run this SQL:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Or via Railway CLI:
```bash
railway connect postgres
# Then in the psql prompt:
CREATE EXTENSION IF NOT EXISTS vector;
\q
```

---

## Step 3: Add Backend Service from GitHub

1. Click **"+ New"** in Railway dashboard
2. Select **"GitHub Repo"**
3. Choose `RRRventures-lab/pubflow-ai`
4. Set **Root Directory** to `backend`
5. Railway will auto-detect the Node.js app

---

## Step 4: Configure Environment Variables

In the Backend service settings, add these variables:

### Required (click "Add Variable" for each):

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Generate with: `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Generate with: `openssl rand -hex 32` |
| `OPENAI_API_KEY` | Your OpenAI API key (`sk-...`) |
| `PORT` | `${{PORT}}` (Railway auto-sets) |

### Auto-configured (link from database services):

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |

**Note:** Use the reference syntax `${{ServiceName.VARIABLE}}` to link database connection strings.

---

## Step 5: Run Migrations and Seed

After the first deployment completes:

```bash
# Navigate to backend directory
cd /Users/gabrielrothschild/Desktop/pubflow-ai/backend

# Link to Railway project (should already be linked)
railway link

# Run migrations
railway run npm run db:migrate

# Seed demo data
railway run npm run db:seed
```

---

## Step 6: Generate Public URL

1. Click on the Backend service
2. Go to **Settings** tab
3. Under **Networking**, click **"Generate Domain"**
4. You'll get a URL like: `pubflow-ai-backend-production.up.railway.app`

---

## Step 7: Deploy Frontend (Vercel - Recommended)

### Via Vercel CLI:

```bash
cd /Users/gabrielrothschild/Desktop/pubflow-ai/frontend

# Install Vercel CLI if needed
npm i -g vercel

# Deploy
vercel

# Set environment variable
vercel env add NUXT_PUBLIC_API_URL
# Enter your Railway backend URL: https://pubflow-ai-backend-production.up.railway.app

# Redeploy with new env
vercel --prod
```

### Or via Vercel Dashboard:

1. Go to https://vercel.com/new
2. Import `RRRventures-lab/pubflow-ai`
3. Set Root Directory to `frontend`
4. Add Environment Variable:
   - `NUXT_PUBLIC_API_URL` = `https://your-backend.up.railway.app`
5. Deploy

---

## Step 8: Update CORS on Backend

Once you have the frontend URL, update the backend CORS setting:

In Railway, add this environment variable:
- `CORS_ORIGIN` = `https://your-frontend.vercel.app`

---

## Verification

1. **Backend Health Check:**
   ```bash
   curl https://your-backend.up.railway.app/api/v1/health
   ```

2. **Login with demo credentials:**
   - Email: `demo@pubflow.ai`
   - Password: `demo1234`

---

## Quick Reference: Generate Secrets

```bash
# JWT Secret
openssl rand -hex 32

# JWT Refresh Secret
openssl rand -hex 32
```

---

## Troubleshooting

### Database Connection Issues
```bash
# Check Railway logs
railway logs

# Verify DATABASE_URL is set
railway variables
```

### Build Failures
- Check that `backend/` is set as root directory
- Verify `railway.toml` is in the backend folder

### CORS Errors
- Make sure `CORS_ORIGIN` matches your frontend URL exactly
- Don't include trailing slash

---

## Estimated Monthly Cost

| Service | Estimate |
|---------|----------|
| Backend (Node.js) | $5-10 |
| PostgreSQL | Included |
| Redis | Included |
| **Total** | **~$5-20/mo** |

Railway's free tier includes $5 of usage per month.
