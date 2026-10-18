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
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%FOLIO_FILE%"
  exit /b 0
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%FOLIO_FILE%"
  exit /b 0
)
if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" "%FOLIO_FILE%"
  exit /b 0
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%FOLIO_FILE%"
  exit /b 0
)
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" "%FOLIO_FILE%"
  exit /b 0
)
start "" "%FOLIO_FILE%"
exit /b 0
