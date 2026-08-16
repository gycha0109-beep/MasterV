@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0MasterV-External-Pilot.ps1" -Mode Run
set "EXITCODE=%ERRORLEVEL%"
echo.
if not "%EXITCODE%"=="0" echo MasterV external pilot did not complete successfully. Review the message above.
echo Evidence file: %~dp0MasterV-external-pilot-evidence.json
pause
exit /b %EXITCODE%
