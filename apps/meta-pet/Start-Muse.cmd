@echo off
setlocal
cd /d "%~dp0"
set "MUSEPET_NODE="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined MUSEPET_NODE set "MUSEPET_NODE=%%N"
if not defined MUSEPET_NODE set "MUSEPET_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%MUSEPET_NODE%" (
  echo Node.js 24 or newer is required. See backend\README.md.
  pause
  exit /b 1
)
echo Starting the Muse API. Keep this window open while using Muse.
echo After editing backend\.env, restart this window to load the new settings.
"%MUSEPET_NODE%" --env-file-if-exists=backend/.env backend/src/server.mjs
pause
