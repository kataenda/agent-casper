# AGENT-CASPER — One-click startup
# Jalankan: .\start.ps1
# Hentikan: Ctrl+C di masing-masing terminal

$root = $PSScriptRoot

Write-Host ""
Write-Host "  AGENT-CASPER  " -ForegroundColor Cyan
Write-Host "  Starting backend + frontend..." -ForegroundColor Gray
Write-Host ""

# ── Backend ───────────────────────────────────────────────────────────────────
$backendCmd = @"
Set-Location '$root\backend'
Write-Host '[BACKEND] Activating venv...' -ForegroundColor Yellow
& '$root\backend\venv\Scripts\Activate.ps1'
Write-Host '[BACKEND] Starting FastAPI on http://localhost:8000' -ForegroundColor Green
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WindowStyle Normal

# Tunggu backend siap (2 detik)
Start-Sleep -Seconds 2

# ── Frontend ──────────────────────────────────────────────────────────────────
$frontendCmd = @"
Set-Location '$root\frontend'
Write-Host '[FRONTEND] Starting Next.js on http://localhost:3000' -ForegroundColor Cyan
npm run dev
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd -WindowStyle Normal

Write-Host "  Backend  → http://localhost:8000" -ForegroundColor Green
Write-Host "  Frontend → http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Buka browser ke http://localhost:3000" -ForegroundColor White
Write-Host "  Tekan Enter untuk tutup window ini..."
Read-Host
