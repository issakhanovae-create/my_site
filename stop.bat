@echo off
chcp 65001 >nul
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker не найден — нечего останавливать через compose.
  pause
  exit /b 1
)

echo Останавливаю контейнер elmira-site...
docker compose down
if errorlevel 1 (
  echo Не удалось выполнить docker compose down.
  pause
  exit /b 1
)

echo Готово. Данные CRM сохранены в Docker volume crm-data.
echo ^(Не используйте "docker compose down -v" — удалит БД.^)
echo.
pause
