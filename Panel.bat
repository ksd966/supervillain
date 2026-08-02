@echo off
setlocal
title Scraper panel

rem Double-click launcher for Windows. Installs dependencies on first run,
rem starts the control panel, and opens the browser at the right URL.

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

rem First run: pull dependencies for every actor. Skipped afterwards, so the
rem usual start is instant.
if not exist "google-leads-scraper\node_modules" (
    echo.
    echo   Prvo pokretanje - instaliram zavisnosti. Ovo traje par minuta.
    echo.
    call npm --prefix google-leads-scraper install || goto :failed
    call npm --prefix instagram-email-scraper install || goto :failed
    call npm --prefix apify-actor install || goto :failed
    echo.
    echo   Gotovo.
    echo.
)

rem Give the server a moment to bind before the browser asks for the page.
start "" /b cmd /c "timeout /t 3 >nul & start http://localhost:8377/"

node control-panel\server.js

echo.
echo   Panel je zaustavljen.
pause
exit /b 0

:failed
echo.
echo   Instalacija nije uspela. Proveri internet vezu i pokusaj ponovo.
echo.
pause
exit /b 1
