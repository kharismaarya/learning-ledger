@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org, or open index.html directly.
  pause
  exit /b 1
)
start "" http://localhost:8765
node serve.js
