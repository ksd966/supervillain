@echo off
setlocal
title Lead Scraper

rem Runs the panel as a desktop application: Chrome or Edge in app mode, which
rem means its own window, its own taskbar entry, and no address bar or tabs.
rem
rem This is not Electron. Electron would mean a 150 MB runtime and a build step
rem to produce a window that looks exactly like this one, using the browser
rem that is already installed.
rem
rem The server opens the window itself once it is listening, so there is no
rem guessing at how long startup takes.

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

if not exist "google-leads-scraper\node_modules" (
    echo.
    echo   Prvo pokretanje - instaliram zavisnosti. Traje par minuta.
    echo.
    call npm --prefix google-leads-scraper install || goto :failed
    call npm --prefix instagram-email-scraper install || goto :failed
    call npm --prefix lead-normalizer install || goto :failed
    call npm --prefix apify-actor install || goto :failed
    echo.
    echo   Gotovo.
    echo.
)

echo.
echo  ================================================================
echo   Aplikacija se pokrece. Ovaj prozor mora ostati otvoren -
echo   zatvori ga da zaustavis panel.
echo.
echo   Sa telefona (isti Wi-Fi): pokreni Panel-Telefon.bat
echo  ================================================================

node control-panel\server.js --open

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
