# Sretan EMR — Setup & Run Guide

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

---

## 2. Install Dependencies

Open **two separate terminals** (PowerShell) in the project root `C:\Users\LuckyGold\Desktop\Sretan EMR`.

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

**Terminal 1 — Backend (Express API on port 3000):**
```powershell
cd server
npx tsx src/server.ts
```
Expected output:
```
Sretan EMR Server running on port 3000
```
The server auto-runs the database schema migration on first boot and creates a default tenant.

**Terminal 2 — Frontend (Vite dev server on port 5173):**
```powershell
cd client
npm run dev
```
Expected output:
```
VITE v6.x.x  ready in XXXms
  ➜  Local:   http://localhost:5173/
```

---

## 4. Access the Application

Open **http://localhost:5173** in your browser.

### Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@sretan.com` | `admin123` |
| Doctor | `doctor@sretan.com` | `doctor123` |
| Nurse | `nurse@sretan.com` | `nurse123` |
| Lab Scientist | `lab@sretan.com` | `lab123` |
| Pharmacist | `pharmacy@sretan.com` | `pharm123` |
| Records | `records@sretan.com` | `records123` |
| Paypoint | `paypoint@sretan.com` | `pay123` |

These 7 accounts cover all roles in the system. If they don't exist, seed them:
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
Expected: `{"status":"ok","timestamp":"...","uptime":...,"clockTampered":false}`

```powershell
# Test patient list
Invoke-RestMethod -Uri "http://localhost:3000/api/patients"
```
Expected: `[]` (empty array if no patients registered yet)

---

## Common Issues

### Port already in use
```powershell
# Find what's using port 3000 or 5173
netstat -ano | Select-String ":3000|:5173"
# Kill the process (replace PID with the number from the output)
taskkill /PID <PID> /F
```

### Database connection refused
- Ensure PostgreSQL service is running: `Get-Service postgresql*`
- Restart if needed: `Restart-Service postgresql-x64-18`
- The server will log `Database initialization failed` and continue running without DB

### Node modules missing
```powershell
cd server && npm install
cd ../client && npm install
```

---

## Stopping the Servers

Press `Ctrl + C` in each terminal to stop the server or client.
