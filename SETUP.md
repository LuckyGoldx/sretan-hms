# Sretan HMS — Setup & Run Guide

## Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Node.js | 18+ | Runtime for server and client |
| PostgreSQL | 16+ | Database |
| npm | 9+ | Package manager |

---

## 1. Database Setup

```powershell
# Create the database
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres sretan_emr
```

If prompted for a password, enter your PostgreSQL `postgres` user password.

The database schema auto-migrates on server startup — you don't need to run any migration scripts manually.

---

## 2. Install Dependencies

Open **two separate terminals** (PowerShell or CMD) in the project root `C:\Users\LuckyGold\Desktop\Sretan EMR`.

**Terminal 1 — Server:**
```powershell
cd server
npm install
```

**Terminal 2 — Client:**
```powershell
cd client
npm install
```

---

## 3. Start the Servers

### Option A: Two Separate Terminals (Recommended for development)

**Terminal 1 — Backend (Express API on port 3000):**
```powershell
cd C:\Users\LuckyGold\Desktop\Sretan EMR\server
npx tsx src/server.ts
```

Expected output:
```
Sretan HMS Server running on port 3000
```

The server auto-runs database schema migration on first boot, creates a default tenant, and seeds wards, staff users, and lab tests.

**Terminal 2 — Frontend (Vite dev server on port 5173):**
```powershell
cd C:\Users\LuckyGold\Desktop\Sretan EMR\client
npm run dev
```

Expected output:
```
VITE v6.x.x  ready in XXXms
  ➜  Local:   http://localhost:5173/
```

### Option B: Hidden Windows (No terminal windows visible)

**Backend:**
```powershell
# In PowerShell
$null = Start-Process powershell -WindowStyle Hidden -ArgumentList "-Command", "cd 'C:\Users\LuckyGold\Desktop\Sretan EMR\server'; npx tsx src/server.ts"
```

**Frontend:**
```powershell
$null = Start-Process powershell -WindowStyle Hidden -ArgumentList "-Command", "cd 'C:\Users\LuckyGold\Desktop\Sretan EMR\client'; npm run dev"
```

### Option C: Using cmd.exe

**Backend:**
```cmd
cd /d "C:\Users\LuckyGold\Desktop\Sretan EMR\server"
npx tsx src/server.ts
```

**Frontend:**
```cmd
cd /d "C:\Users\LuckyGold\Desktop\Sretan EMR\client"
npm run dev
```

---

## 4. Access the Application

Open **http://localhost:5173** in your browser.

The login page is at **http://localhost:5173/login**.

### Default Login Credentials

Login with a **username** or email. These 7 accounts are seeded automatically on first startup:

| Role | Username | Email | Password |
|------|----------|-------|----------|
| Admin | `admin` | `admin@sretan.com` | `admin123` |
| Doctor | `doctor` | `doctor@sretan.com` | `doctor123` |
| Nurse | `nurse` | `nurse@sretan.com` | `nurse123` |
| Lab Scientist | `lab` | `lab@sretan.com` | `lab123` |
| Pharmacist | `pharmacy` | `pharmacy@sretan.com` | `pharm123` |
| Records | `records` | `records@sretan.com` | `records123` |
| Paypoint | `paypoint` | `paypoint@sretan.com` | `pay123` |

If they don't exist, seed them:
```powershell
cd server
node seed_users.cjs
```

---

## 5. Verify Everything is Running

```powershell
# Test backend health endpoint
Invoke-RestMethod -Uri "http://localhost:3000/api/health"
```

Expected:
```json
{"status":"ok","timestamp":"...","uptime":...,"clockTampered":false}
```

```powershell
# Test frontend is serving
Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing
```

Expected: StatusCode `200`

---

## Common Issues

### Port already in use

```powershell
# Find what's using port 3000 or 5173
netstat -ano | Select-String ":3000 |:5173 "
# Kill the process (replace PID with the number from the output)
taskkill /PID <PID> /F
```

### Database connection refused

- Ensure PostgreSQL service is running: `Get-Service postgresql*`
- Restart if needed: `Restart-Service postgresql-x64-18`
- Check connection string in `server/src/db/pool.ts`

### Node modules missing

```powershell
cd C:\Users\LuckyGold\Desktop\Sretan EMR\server && npm install
cd C:\Users\LuckyGold\Desktop\Sretan EMR\client && npm install
```

### Viewing server logs

The server logs to the terminal. If started in a hidden window, check:
```powershell
Get-Process -Name node -ErrorAction SilentlyContinue
```

### Clinic profile not configured

If you see "Clinic Not Configured" at `/login`, check:
```powershell
# Verify clinic_profile.json exists
Get-Content "C:\hms\config\clinic_profile.json"
```

If missing, create one with at minimum:
```json
{"hospital_name": "Sretan HMS", "GLOBAL_SAAS_TENANT_ID": "00000000-0000-0000-0000-000000000001"}
```

---

## Stopping the Servers

Press `Ctrl + C` in each terminal to stop the server or client.

For hidden windows:
```powershell
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name powershell -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "tsx|vite" } | Stop-Process -Force
```
