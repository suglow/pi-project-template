@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.19+ must be installed and available on PATH. 1>&2
  exit /b 1
)
node "%~dp0configure-models.mjs" %*
exit /b %errorlevel%
