#!/bin/bash

# Скрипт для быстрой настройки VPS
# Запустите на вашем VPS: bash vps-commands.sh

set -e

echo "🚀 Начинаем настройку VPS для Ononimka Telegram Bot..."
echo ""

# Проверка Ubuntu
if [ ! -f /etc/lsb-release ]; then
    echo "❌ Этот скрипт предназначен для Ubuntu"
    exit 1
fi

echo "📦 Шаг 1: Обновление системы..."
sudo apt update && sudo apt upgrade -y

echo "📦 Шаг 2: Установка зависимостей..."
sudo apt install -y curl git ufw ca-certificates gnupg lsb-release

echo "🐳 Шаг 3: Установка Docker..."
# Добавление Docker GPG ключа
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Добавление Docker репозитория
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Установка Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Добавление пользователя в docker группу
sudo usermod -aG docker $USER

# Включение автозапуска
sudo systemctl enable docker
sudo systemctl start docker

echo "✅ Docker установлен: $(docker --version)"
echo "✅ Docker Compose установлен: $(docker compose version)"
echo ""

echo "🔥 Шаг 4: Настройка Firewall..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 22/tcp
sudo ufw --force enable

echo "✅ Firewall настроен"
echo ""

echo "📁 Шаг 5: Создание директории приложения..."
sudo mkdir -p /opt/ononimka
sudo chown $USER:$USER /opt/ononimka
cd /opt/ononimka

echo "✅ Директория создана: /opt/ononimka"
echo ""

echo "🎉 Настройка VPS завершена!"
echo ""
echo "📝 СЛЕДУЮЩИЕ ШАГИ:"
echo ""
echo "1. Выйдите и войдите заново для применения прав Docker:"
echo "   exit"
echo ""
echo "2. Создайте файл .env в /opt/ononimka/:"
echo "   cd /opt/ononimka"
echo "   nano .env"
echo ""
echo "3. Вставьте содержимое из .env.production.example"
echo ""
echo "4. Настройте GitHub Secrets в вашем репозитории"
echo ""
echo "5. Сделайте git push origin main для запуска деплоя"
echo ""
echo "📖 Полная инструкция: DEPLOYMENT.md"
