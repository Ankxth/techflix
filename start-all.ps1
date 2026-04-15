# Techflix Backend Orchestrator
Write-Host "🚀 Waking up the Techflix Backend Trio..." -ForegroundColor Cyan
Write-Host "-------------------------------------------------------"

# 1. Start Security Service (Port 3002)
Write-Host "Starting Security Service [3002]..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services/security; node index.js"

# 2. Start Integrity Service (Port 3003)
Write-Host "Starting Integrity Service [3003]..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services/integrity; node index.js"

# 3. Start Report Aggregator (Port 3004)
Write-Host "Starting Report Aggregator [3004]..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services/report; node index.js"

Write-Host "-------------------------------------------------------"
Write-Host "✅ ALL SERVICES ACTIVE" -ForegroundColor Green
Write-Host "Send POST requests to: http://localhost:3004/report/generate" -ForegroundColor Cyan
Write-Host "Note: Keep the three new windows open during the demo!" -ForegroundColor Gray