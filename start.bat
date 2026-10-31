@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM Основной запуск проекта — через Docker.
REM Локально без Docker: start-local.bat

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker не найден.
  echo.
  echo Установите Docker Desktop: https://www.docker.com/products/docker-desktop/
  echo Или запустите без Docker: start-local.bat
  echo.
  pause
  exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
  echo Docker установлен, но демон не отвечает.
  echo Запустите Docker Desktop и повторите.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" (
    copy /Y ".env.example" ".env" >nul
    echo Создан .env из .env.example
    echo Откройте .env и задайте ADMIN_PASSWORD ^(минимум 12 символов^), затем запустите снова.
    echo.
    pause
    exit /b 1
  )
  echo Нет файла .env и .env.example — нечем конфигурировать сервер.
  pause
  exit /b 1
)

echo.
echo Запуск elmira-site в Docker...
echo.

docker compose up -d --build
if errorlevel 1 (
  echo.
  echo Не удалось запустить контейнер.
  echo Проверьте: Docker Desktop запущен, порт 8765 свободен
  echo ^(закройте start-local.bat / npm start, если они работают^).
  echo.
  pause
  exit /b 1
)

echo.
echo Готово.
echo   Сайт:    http://127.0.0.1:8765
echo   Админка: http://127.0.0.1:8765/admin
echo.
echo   Логи:    docker compose logs -f
echo   Стоп:    stop.bat
echo   Бэкап БД: docker-export-data.bat
echo.
pause
