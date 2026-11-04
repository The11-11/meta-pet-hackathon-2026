@echo off
setlocal
cd /d "%~dp0"
set "METAPET_NODE="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined METAPET_NODE set "METAPET_NODE=%%N"
if not defined METAPET_NODE set "METAPET_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%METAPET_NODE%" (
  echo Install Node.js 24 or newer, then follow README.md.
  pause
  exit /b 1
)
if not exist "node_modules\expo\bin\cli" (
  echo Install this project's dependencies using the steps in README.md first.
  pause
  exit /b 1
)
for %%N in ("%METAPET_NODE%") do set "PATH=%%~dpN;%PATH%"
set "EXPO_OFFLINE=1"
echo Starting Meta Pet. Keep this window open while using the preview.
"%METAPET_NODE%" --dns-result-order=ipv4first node_modules\expo\bin\cli start --web --localhost --port 8083
pause
