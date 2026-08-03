@echo off
setlocal
title Ciscenje radnog foldera

rem Double-click cleaner for the folder this project sits in. Reports first and
rem waits for a yes, because the thing it deletes is old copies of the project
rem and getting that wrong costs you the folder you were working in.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   Node.js nije pronadjen.
    echo   Instaliraj ga sa https://nodejs.org  ^(LTS verzija^) pa pokreni ponovo.
    echo.
    pause
    exit /b 1
)

echo.
echo   Pregled — jos uvek se nista ne brise.
echo.
node scripts\cleanup.mjs
if errorlevel 1 goto :end

echo.
set /p answer="  Obrisati sve navedeno? (d = da, bilo sta drugo = ne): "
if /i not "%answer%"=="d" (
    echo.
    echo   Nista nije obrisano.
    goto :end
)

echo.
node scripts\cleanup.mjs --fix

:end
echo.
pause
exit /b 0
