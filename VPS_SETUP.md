# 🚀 Быстрая настройка VPS

## 📝 Шпаргалка по командам

### На VPS (первоначальная настройка)

```bash
# 1. Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Выйдите и войдите заново

# 2. Создание директории
sudo mkdir -p /opt/ononimka
sudo chown $USER:$USER /opt/ononimka
cd /opt/ononimka

# 3. Создание .env файла
cat > .env << 'EOF'
POSTGRES_USER=ononimka
POSTGRES_PASSWORD=ВАШ_НАДЕЖНЫЙ_ПАРОЛЬ
POSTGRES_DB=ononimka
TELEGRAM_BOT_TOKEN=ваш_токен
ADMIN_USERNAME=ваш_username
GROUP_CHAT_ID=ваш_chat_id
GROUP_CHAT_LINK=ваша_ссылка
GITHUB_REPOSITORY_OWNER=ваш_github_username
IMAGE_TAG=latest
MODERATION=false
MAX_MESSAGES_PER_DAY=100
EOF

chmod 600 .env
```

### GitHub Secrets (9 штук)

| Секрет             | Значение           |
| ------------------ | ------------------ |
| VPS_HOST           | IP адрес VPS       |
| VPS_USERNAME       | ubuntu             |
| VPS_SSH_KEY        | Приватный SSH ключ |
| VPS_PORT           | 22                 |
| TELEGRAM_BOT_TOKEN | Токен бота         |
| ADMIN_USERNAME     | Username админа    |
| GROUP_CHAT_ID      | ID группы          |
| GROUP_CHAT_LINK    | Ссылка на группу   |
| POSTGRES_PASSWORD  | Пароль БД          |

### Команды для мониторинга

```bash
# Статус
docker compose -f docker-compose.prod.yml ps

# Логи
docker compose -f docker-compose.prod.yml logs -f app

# Перезапуск
docker compose -f docker-compose.prod.yml restart app

# Backup БД
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U ononimka ononimka > backup_$(date +%Y%m%d).sql
```

## 🎯 Процесс деплоя

```
git push origin main → GitHub Actions → Сборка → Деплой на VPS → ✅ Готово!
```

---

📖 **Полная инструкция:** [DEPLOYMENT.md](DEPLOYMENT.md)
