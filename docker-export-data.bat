@echo off
chcp 65001 >nul
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker не найден.
  pause
  exit /b 1
)

docker compose ps --status running -q app >nul 2>nul
if errorlevel 1 (
  echo Контейнер не запущен. Сначала start.bat
  pause
  exit /b 1
)

set "STAMP=%DATE:~6,4%-%DATE:~3,2%-%DATE:~0,2%_%TIME:~0,2%-%TIME:~3,2%-%TIME:~6,2%"
set "STAMP=%STAMP: =0%"
set "OUT=data\docker-export-%STAMP%"

mkdir "%OUT%" 2>nul
echo Экспорт /app/data из контейнера в %OUT% ...

docker compose cp app:/app/data/. "%OUT%\"
if errorlevel 1 (
  echo Экспорт не удался.
  pause
  exit /b 1
)

echo.
echo Готово: %OUT%
echo Там crm.db и backups. Можно копировать на флешку / сдавать архив.
echo.
pause
