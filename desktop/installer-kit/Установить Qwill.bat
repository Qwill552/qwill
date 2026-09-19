@echo off
title Установка Qwill

net session >nul 2>&1
if errorlevel 1 (
    echo Нужны права администратора. Подтвердите запрос Windows.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

set "CER="
for %%f in (*.cer) do set "CER=%%f"
set "EXE="
for %%f in (Qwill-Setup-*.exe) do set "EXE=%%f"

if not defined CER goto :nofiles
if not defined EXE goto :nofiles

echo Добавляю сертификат Qwill в доверенные...
certutil -addstore -f Root "%CER%" >nul || goto :fail
certutil -addstore -f TrustedPublisher "%CER%" >nul || goto :fail

echo Готово. Запускаю установщик...
start "" "%EXE%"
exit /b

:nofiles
echo.
echo Рядом с этим файлом нет установщика или сертификата.
echo Распакуйте архив целиком и запустите заново.
echo.
pause
exit /b 1

:fail
echo.
echo Не удалось добавить сертификат.
echo.
pause
exit /b 1
