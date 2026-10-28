# start.ps1 - One-click startup for URL shortener
$ErrorActionPreference = "Continue"
$projectDir = "C:\Users\New User\Desktop\Sipho Makubalo\Development\Personal\Extra Projects\P1\url-shortener"

Write-Host "1/5  Getting WSL IP..." -ForegroundColor Cyan
$ip = (wsl -d Ubuntu bash -c "hostname -I").Trim().Split()[0]
Write-Host "     WSL IP: $ip" -ForegroundColor Green

Write-Host "2/5  Starting PostgreSQL + Redis in WSL..." -ForegroundColor Cyan
$svcOut = wsl -d Ubuntu bash -c "echo '1234' | sudo -S service postgresql start 2>/dev/null; echo '1234' | sudo -S service redis-server start 2>/dev/null; sleep 2; redis-cli ping" 2>&1
Write-Host "     Redis: $($svcOut.Trim())" -ForegroundColor Green

Write-Host "3/5  Updating .env with WSL IP..." -ForegroundColor Cyan
$envContent = @"
PORT=3000
BASE_URL=http://localhost:3000
DATABASE_URL=postgresql://devuser:devpassword@$($ip):5432/shortener_db
REDIS_URL=redis://$($ip):6379
"@
$envContent | Set-Content -Path "$projectDir\.env"

Write-Host "4/5  Killing old server processes..." -ForegroundColor Cyan
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host "5/5  Starting Node.js server..." -ForegroundColor Cyan
Set-Location $projectDir
node src/index.js