#!/bin/bash

# Скрипт для настройки SSH ключей для GitHub Actions
# Запустите на локальной машине: bash setup-ssh-key.sh

set -e

echo "🔑 Настройка SSH ключей для GitHub Actions..."
echo ""

# Запрос данных VPS
read -p "Введите IP адрес VPS: " VPS_IP
read -p "Введите SSH username (обычно ubuntu или root): " VPS_USER
read -p "Введите SSH порт (обычно 22): " VPS_PORT
VPS_PORT=${VPS_PORT:-22}

echo ""
echo "📝 Данные VPS:"
echo "  IP: $VPS_IP"
echo "  Username: $VPS_USER"
echo "  Port: $VPS_PORT"
echo ""

# Генерация SSH ключа
KEY_PATH="$HOME/.ssh/ononimka_deploy"

if [ -f "$KEY_PATH" ]; then
    echo "⚠️  SSH ключ уже существует: $KEY_PATH"
    read -p "Перезаписать? (y/n): " OVERWRITE
    if [ "$OVERWRITE" != "y" ]; then
        echo "❌ Отменено"
        exit 0
    fi
    rm -f "$KEY_PATH" "${KEY_PATH}.pub"
fi

echo "🔐 Генерация SSH ключа..."
ssh-keygen -t ed25519 -C "github-actions-ononimka" -f "$KEY_PATH" -N ""

echo ""
echo "✅ SSH ключ создан:"
echo "  Приватный: $KEY_PATH"
echo "  Публичный: ${KEY_PATH}.pub"
echo ""

# Копирование на VPS
echo "📤 Копирование публичного ключа на VPS..."
ssh-copy-id -i "${KEY_PATH}.pub" -p "$VPS_PORT" "${VPS_USER}@${VPS_IP}"

echo ""
echo "🧪 Тестирование подключения..."
if ssh -i "$KEY_PATH" -p "$VPS_PORT" -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_IP}" "echo 'SSH connection successful!'"; then
    echo "✅ SSH подключение работает!"
else
    echo "❌ SSH подключение не удалось!"
    echo "Проверьте данные и попробуйте снова"
    exit 1
fi

echo ""
echo "📋 Теперь добавьте следующие секреты в GitHub:"
echo ""
echo "Repository → Settings → Secrets and variables → Actions → New repository secret"
echo ""
echo "─────────────────────────────────────────────────────────────"
echo "Секрет: VPS_HOST"
echo "Значение: $VPS_IP"
echo "─────────────────────────────────────────────────────────────"
echo "Секрет: VPS_USERNAME"
echo "Значение: $VPS_USER"
echo "─────────────────────────────────────────────────────────────"
echo "Секрет: VPS_PORT"
echo "Значение: $VPS_PORT"
echo "─────────────────────────────────────────────────────────────"
echo "Секрет: VPS_SSH_KEY"
echo "Значение: (будет скопировано в clipboard)"
echo ""

# Копирование приватного ключа в clipboard
if command -v pbcopy &> /dev/null; then
    # macOS
    cat "$KEY_PATH" | pbcopy
    echo "✅ Приватный ключ скопирован в clipboard (macOS)"
elif command -v xclip &> /dev/null; then
    # Linux с xclip
    cat "$KEY_PATH" | xclip -selection clipboard
    echo "✅ Приватный ключ скопирован в clipboard (Linux)"
elif command -v xsel &> /dev/null; then
    # Linux с xsel
    cat "$KEY_PATH" | xsel --clipboard
    echo "✅ Приватный ключ скопирован в clipboard (Linux)"
else
    echo "⚠️  Автоматическое копирование недоступно"
    echo "Вручную скопируйте приватный ключ:"
    echo ""
    cat "$KEY_PATH"
fi

echo ""
echo "─────────────────────────────────────────────────────────────"
echo ""
echo "🎯 Следующие шаги:"
echo ""
echo "1. Перейдите в GitHub: https://github.com/YOUR_USERNAME/ononimka/settings/secrets/actions"
echo "2. Добавьте 4 секрета указанных выше"
echo "3. Также добавьте остальные секреты:"
echo "   - TELEGRAM_BOT_TOKEN"
echo "   - ADMIN_USERNAME"
echo "   - GROUP_CHAT_ID"
echo "   - GROUP_CHAT_LINK"
echo "   - POSTGRES_PASSWORD"
echo ""
echo "4. Сделайте git push для запуска деплоя:"
echo "   git commit --allow-empty -m 'Test deployment'"
echo "   git push origin main"
echo ""
echo "✅ Готово!"
