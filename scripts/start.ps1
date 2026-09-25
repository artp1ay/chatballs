# Локальный запуск Chatballs dev-контура (Windows).
#
# Запуск одной командой с автопосевом демоданных «Ателье Норд» (HOM-58):
#   .\scripts\start.ps1
# Или напрямую:
#   docker compose -f compose.dev.yaml up -d --build --wait
#
# Сброс окружения к чистому состоянию:
#   .\scripts\start.ps1 -Reset
param(
    [ValidateSet("Cloud", "SelfHosted")]
    [string] $Mode = "Cloud",
    [switch] $Reset = $false,
    [switch] $Attach = $false
)

$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

if ($Reset) {
    Write-Output "Сброс dev-окружения: остановка контейнеров и удаление данных..."
    docker compose -f compose.dev.yaml down --volumes --remove-orphans
    if (Test-Path "data\postgres") { Remove-Item -Recurse -Force "data\postgres" }
    if (Test-Path "data\redis") { Remove-Item -Recurse -Force "data\redis" }
    if (Test-Path "data\media") { Remove-Item -Recurse -Force "data\media" }
    Write-Output "Локальные данные очищены."
}

$delivery = if ($Mode -eq "SelfHosted") { "SELF_HOSTED" } else { "CLOUD" }
Write-Output "Запуск dev-окружения Chatballs (режим поставки: $delivery)..."

$env:CHATBALLS_DELIVERY_MODE = $delivery

if (-not $Attach) {
    docker compose -f compose.dev.yaml up -d --build --wait
    Write-Output ""
    Write-Output "======================================================================"
    Write-Output "Chatballs Dev-контур успешно запущен!"
    Write-Output ""
    Write-Output "Интерфейс:     http://localhost/"
    Write-Output "Платформа:     http://platform.localhost/"
    Write-Output "Веб-чат:       http://localhost/chat/"
    Write-Output ""
    Write-Output "Демоданные («Ателье Норд») загружены."
    Write-Output "Учетные записи (единый пароль: Chatballs-Demo-2026):"
    Write-Output "  - Администратор установки: admin@atelie-nord.ru"
    Write-Output "  - Демо-администратор:      e.kuznetsova@atelie-nord.ru"
    Write-Output "  - Демо-оператор:          s.petrova@atelie-nord.ru"
    Write-Output ""
    Write-Output "Полезные команды:"
    Write-Output "  Статус сервисов: docker compose -f compose.dev.yaml ps"
    Write-Output "  Просмотр логов:  docker compose -f compose.dev.yaml logs -f"
    Write-Output "  Остановка:       docker compose -f compose.dev.yaml down"
    Write-Output "  Полный сброс:    .\scripts\start.ps1 -Reset"
    Write-Output "======================================================================"
} else {
    docker compose -f compose.dev.yaml up --build
}
