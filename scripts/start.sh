#!/usr/bin/env sh
# Локальный запуск Chatballs dev-контура (Linux/macOS).
#
# Запуск одной командой с автопосевом демоданных «Ателье Норд» (HOM-58):
#   ./scripts/start.sh
# Или напрямую:
#   docker compose -f compose.dev.yaml up -d --build --wait
#
# Сброс окружения к чистому состоянию:
#   ./scripts/start.sh --reset
set -eu

cd "$(dirname "$0")/.."

mode="CLOUD"
reset=0
detach=1

while [ $# -gt 0 ]; do
  case "$1" in
    --mode)
      shift
      case "${1:-}" in
        cloud|CLOUD) mode="CLOUD" ;;
        self-hosted|SELF_HOSTED|selfhosted) mode="SELF_HOSTED" ;;
        *) echo "Неизвестный режим: ${1:-}. Допустимо: cloud, self-hosted" >&2; exit 2 ;;
      esac
      shift
      ;;
    --reset)
      reset=1
      shift
      ;;
    --no-wait|--attach)
      detach=0
      shift
      ;;
    -h|--help)
      echo "Использование: $0 [--mode cloud|self-hosted] [--reset] [--attach]" >&2
      echo "  --mode   Режим поставки: cloud (по умолчанию) или self-hosted" >&2
      echo "  --reset  Остановить и полностью очистить локальные тома и БД перед запуском" >&2
      echo "  --attach Запуск с выводом логов контейнеров в текущую консоль" >&2
      exit 0
      ;;
    *) echo "Неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
done

if [ "$reset" -eq 1 ]; then
  echo "Сброс dev-окружения: остановка контейнеров и удаление данных..."
  docker compose -f compose.dev.yaml down --volumes --remove-orphans || true
  rm -rf data/postgres data/redis data/media
  echo "Локальные данные очищены."
fi

echo "Запуск dev-окружения Chatballs (режим поставки: $mode)..."
export CHATBALLS_DELIVERY_MODE="$mode"

if [ "$detach" -eq 1 ]; then
  docker compose -f compose.dev.yaml up -d --build --wait
  echo ""
  echo "======================================================================"
  echo "Chatballs Dev-контур успешно запущен!"
  echo ""
  echo "Интерфейс:     http://localhost/"
  echo "Платформа:     http://platform.localhost/"
  echo "Веб-чат:       http://localhost/chat/"
  echo ""
  echo "Демоданные («Ателье Норд») загружены."
  echo "Учетные записи (единый пароль: Chatballs-Demo-2026):"
  echo "  - Администратор установки: admin@atelie-nord.ru"
  echo "  - Демо-администратор:      e.kuznetsova@atelie-nord.ru"
  echo "  - Демо-оператор:          s.petrova@atelie-nord.ru"
  echo ""
  echo "Полезные команды:"
  echo "  Статус сервисов: docker compose -f compose.dev.yaml ps"
  echo "  Просмотр логов:  docker compose -f compose.dev.yaml logs -f"
  echo "  Остановка:       docker compose -f compose.dev.yaml down"
  echo "  Полный сброс:    ./scripts/start.sh --reset"
  echo "======================================================================"
else
  exec docker compose -f compose.dev.yaml up --build
fi
