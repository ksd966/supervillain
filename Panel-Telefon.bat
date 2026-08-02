@echo off
setlocal enabledelayedexpansion
title Scraper panel - pristup sa telefona

rem Same panel, but prints the LAN address to open on a phone and reminds you
rem what to do if the phone is not on the same Wi-Fi.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo   Node.js nije pronadjen. Instaliraj ga sa https://nodejs.org
    pause
    exit /b 1
)

rem First IPv4 address Windows reports, which on a normal home setup is the
rem Wi-Fi one. If it is wrong, `ipconfig` shows the rest.
set "LANIP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    if not defined LANIP (
        set "LANIP=%%a"
        set "LANIP=!LANIP: =!"
    )
)
if not defined LANIP set "LANIP=<IP-ovog-PCja>"

echo.
echo  ================================================================
echo   Na telefonu otvori (isti Wi-Fi):
echo.
echo      http://!LANIP!:8377/
echo.
echo   Token je ispisan ispod kad se panel pokrene - nalepi ga u polje.
echo.
echo   Ako telefon NIJE na istom Wi-Fi-ju, u drugom prozoru pokreni:
echo      ngrok http 8377
echo   pa otvori adresu koju ngrok ispise.
echo.
echo   Windows Firewall ce prvi put pitati za dozvolu - potvrdi je,
echo   inace telefon nece moci da se poveze.
echo  ================================================================
echo.

node control-panel\server.js

pause
