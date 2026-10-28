# start.ps1 - One-click startup for URL shortener
$ErrorActionPreference = "Continue"
$projectDir = "C:\Users\New User\Desktop\Sipho Makubalo\Development\Personal\Extra Projects\P1\url-shortener"

Write-Host "1/4  Getting WSL IP..." -ForegroundColor Cyan
$ip = (wsl -d Ubuntu bash -c "hostname -I").Trim().Split()[0]
Write-Host "     WSL IP: $ip" -ForegroundColor Green

Write-Host "2/4  Starting PostgreSQL + Redis in WSL..." -ForegroundColor Cyan
wsl -d Ubuntu bash -c "echo '1234' | sudo -S service postgresql start 2>/dev/null; echo '1234' | sudo -S service redis-server start 2>/dev/null" | Out-Null
Start-Sleep -Seconds 3
$redisPing = wsl -d Ubuntu bash -c "redis-cli ping" 2>&1
Write-Host "     Redis: $redisPing" -ForegroundColor Green

Write-Host "3/4  Killing old server processes..." -ForegroundColor Cyan
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host "4/4  Starting Node.js server (using Neon DATABASE_URL from .env)..." -ForegroundColor Cyan
Set-Location $projectDir
node src/index.js