@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM Запасной запуск БЕЗ Docker (нужны Node.js >= 22.5 и npm).
REM Основной способ: start.bat

echo.
echo Локальный режим без Docker.
echo Если уже запущен Docker на порту 8765 — сначала stop.bat
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не найден. Установи с https://nodejs.org/
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm не найден. Переустанови Node.js с https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\" (
  echo Устанавливаю зависимости...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Собираю React-фронт...
call npm run build
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo Сайт:    http://127.0.0.1:8765
echo Админка: http://127.0.0.1:8765/admin
echo.
echo Для разработки UI: в другом окне npm run dev
echo.
:restart
node server.cjs
if errorlevel 1 (
  echo.
  echo Сервер упал, перезапуск через 3 секунды... (Ctrl+C — остановить)
  timeout /t 3 /nobreak >nul
  goto restart
)
pause
