@echo off
chcp 65001 >nul
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker не найден.
  pause
  exit /b 1
)

if not exist "data\crm.db" (
  echo Нет файла data\crm.db — нечего импортировать.
  pause
  exit /b 1
)

echo.
echo Импорт data\crm.db в Docker volume crm-data.
echo Сначала остановите start-local.bat / npm start ^(БД не должна быть открыта на хосте^).
echo.
pause

docker compose stop app 2>nul

REM Только crm.db (+ products.json). WAL/SHM с Windows для Linux SQLite ненадёжны.
docker compose run --rm -v "%cd%/data:/from:ro" --entrypoint sh app -c "mkdir -p /app/data/backups && cp -f /from/crm.db /app/data/crm.db && if [ -f /from/products.json ]; then cp -f /from/products.json /app/data/products.json; fi && rm -f /app/data/crm.db-wal /app/data/crm.db-shm && chown -R node:node /app/data && ls -la /app/data"
if errorlevel 1 (
  echo Импорт не удался.
  pause
  exit /b 1
)

docker compose up -d
echo.
echo Готово. Сайт: http://127.0.0.1:8765
echo.
pause
