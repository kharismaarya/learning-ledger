@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo First run: installing and building the app. This takes a minute.
  call npm install || (pause & exit /b 1)
  call npm run build || (pause & exit /b 1)
)
start "" http://localhost:8765
node server/index.ts
