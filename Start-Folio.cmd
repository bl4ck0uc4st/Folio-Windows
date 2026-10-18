@echo off
setlocal DisableDelayedExpansion
rem Portable local launcher. No installs, downloads, server, or admin rights.
set "FOLIO_FILE=%~dp0Folio-Windows.html"
if not exist "%FOLIO_FILE%" (
  echo Folio-Windows.html was not found.
  echo Extract the entire ZIP into a folder before opening Start-Folio.cmd.
  pause
  exit /b 1
)
rem Read Windows environment names locally; no network or execution-policy changes.
set "FOLIO_URL="
for /f "usebackq delims=" %%U in (`powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$p=([System.Uri]$env:FOLIO_FILE).AbsoluteUri; $n=[Uri]::EscapeDataString($env:COMPUTERNAME); $u=[Uri]::EscapeDataString($env:USERNAME); Write-Output ($p+'?pc='+$n+'&user='+$u)"`) do set "FOLIO_URL=%%U"
if not defined FOLIO_URL set "FOLIO_URL=%FOLIO_FILE%"
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%FOLIO_URL%"
  exit /b 0
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%FOLIO_URL%"
  exit /b 0
)
if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" "%FOLIO_URL%"
  exit /b 0
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%FOLIO_URL%"
  exit /b 0
)
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" "%FOLIO_URL%"
  exit /b 0
)
start "" "%FOLIO_URL%"
exit /b 0
