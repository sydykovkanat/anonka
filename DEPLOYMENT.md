# 🚀 Инструкция по развертыванию на VPS

Это руководство поможет вам развернуть Telegram бота Ononimka на VPS с автоматическим CI/CD через GitHub Actions.

## 📋 Что было создано

- ✅ [.github/workflows/deploy.yml](.github/workflows/deploy.yml) - GitHub Actions workflow
- ✅ [docker-compose.prod.yml](docker-compose.prod.yml) - Production конфигурация
- ✅ [.env.production.example](.env.production.example) - Шаблон переменных окружения
- ✅ [.dockerignore](.dockerignore) - Оптимизированный для production

## 🎯 Этап 1: Настройка VPS

### 1.1 Подключитесь к VPS через SSH

```bash
ssh your_username@your_vps_ip
```

### 1.2 Установите Docker и Docker Compose

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка зависимостей
sudo apt install -y curl git ufw ca-certificates gnupg lsb-release

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

# Включение автозапуска Docker
sudo systemctl enable docker
sudo systemctl start docker

# Проверка установки
docker --version
docker compose version
```

**⚠️ ВАЖНО:** После добавления в docker группу выйдите и войдите заново:
```bash
exit
# Войдите снова через SSH
ssh your_username@your_vps_ip
```

### 1.3 Настройте Firewall (опционально, но рекомендуется)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 22/tcp
sudo ufw --force enable
sudo ufw status verbose
```

**Примечание:** Порты 3000 и 5432 открывать НЕ нужно - бот работает через Telegram API.

### 1.4 Создайте директорию для приложения

```bash
# Создание директории
sudo mkdir -p /opt/ononimka
sudo chown $USER:$USER /opt/ononimka
cd /opt/ononimka
```

### 1.5 Создайте файл .env с production данными

```bash
cd /opt/ononimka
nano .env
```

Вставьте следующее содержимое (замените значения на свои):

```env
POSTGRES_USER=ononimka
POSTGRES_PASSWORD=СОЗДАЙТЕ_НАДЕЖНЫЙ_ПАРОЛЬ_ЗДЕСЬ
POSTGRES_DB=ononimka
TELEGRAM_BOT_TOKEN=ваш_токен_бота_от_BotFather
ADMIN_USERNAME=ваш_admin_username
GROUP_CHAT_ID=ваш_group_chat_id
GROUP_CHAT_LINK=ваша_ссылка_на_группу
GITHUB_REPOSITORY_OWNER=ваш_github_username
IMAGE_TAG=latest
MODERATION=false
MAX_MESSAGES_PER_DAY=100
```

**Генерация надежного пароля PostgreSQL:**
```bash
openssl rand -base64 32
```

Сохраните файл: `Ctrl+O`, затем `Enter`, затем `Ctrl+X`

**Защитите файл .env:**
```bash
chmod 600 /opt/ononimka/.env
```

---

## 🔑 Этап 2: Настройка GitHub

### 2.1 Создайте SSH ключи для GitHub Actions (на вашей локальной машине)

```bash
# Генерация SSH ключа
ssh-keygen -t rsa -b 4096 -C "github-actions-deploy" -f ~/.ssh/ononimka_deploy

# Копирование публичного ключа на VPS
ssh-copy-id -i ~/.ssh/ononimka_deploy.pub your_username@your_vps_ip

# Показать приватный ключ (скопируйте весь вывод)
cat ~/.ssh/ononimka_deploy
```

### 2.2 Настройте GitHub Secrets

Перейдите в ваш репозиторий на GitHub:
**Settings → Secrets and variables → Actions → New repository secret**

Создайте следующие секреты:

| Имя секрета | Описание | Пример значения |
|-------------|----------|----------------|
| `VPS_HOST` | IP адрес VPS | `123.45.67.89` |
| `VPS_USERNAME` | SSH пользователь | `ubuntu` или `root` |
| `VPS_SSH_KEY` | Приватный SSH ключ | Содержимое `~/.ssh/ononimka_deploy` |
| `VPS_PORT` | SSH порт | `22` |
| `TELEGRAM_BOT_TOKEN` | Токен бота | `123456:ABC-DEF...` |
| `ADMIN_USERNAME` | Admin username | `nur_ksydykov` |
| `GROUP_CHAT_ID` | ID группы | `-1003343344424` |
| `GROUP_CHAT_LINK` | Ссылка на группу | `https://t.me/...` |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL | Тот же что в .env на VPS |

**⚠️ ВАЖНО:**
- `VPS_SSH_KEY` должен содержать ВЕСЬ приватный ключ, включая `-----BEGIN OPENSSH PRIVATE KEY-----` и `-----END OPENSSH PRIVATE KEY-----`
- `POSTGRES_PASSWORD` должен совпадать с паролем в `/opt/ononimka/.env` на VPS

---

## 🚢 Этап 3: Первоначальный деплой

### 3.1 Push кода в GitHub (на локальной машине)

```bash
cd /Users/sydykov/Work/telegram/ononimka

# Добавьте все файлы
git add .

# Создайте коммит
git commit -m "Add production deployment configuration"

# Push в main ветку (запустит GitHub Actions)
git push origin main
```

### 3.2 Проверьте GitHub Actions

1. Перейдите в репозиторий на GitHub
2. Откройте вкладку **Actions**
3. Вы должны увидеть запущенный workflow "Build and Deploy to VPS"
4. Дождитесь завершения (обычно 3-5 минут)

Workflow выполнит:
- ✅ Сборку Docker образа
- ✅ Публикацию в GitHub Container Registry
- ✅ SSH подключение к VPS
- ✅ Pull новых образов
- ✅ Запуск миграций БД
- ✅ Перезапуск контейнеров

### 3.3 Проверка на VPS

```bash
# Подключитесь к VPS
ssh your_username@your_vps_ip

# Перейдите в директорию
cd /opt/ononimka

# Проверьте статус контейнеров
docker compose -f docker-compose.prod.yml ps

# Ожидаемый вывод:
# NAME                 STATUS
# ononimka-postgres    Up (healthy)
# ononimka-app         Up

# Посмотрите логи
docker compose -f docker-compose.prod.yml logs -f app
```

### 3.4 Проверьте работу бота

Отправьте сообщение вашему боту в Telegram и убедитесь, что он отвечает.

---

## 🔄 Автоматический деплой

Теперь каждый раз когда вы делаете `git push origin main`, происходит автоматический деплой:

```bash
# На вашей локальной машине
git add .
git commit -m "Update feature"
git push origin main
```

GitHub Actions автоматически:
1. Соберет новый Docker образ
2. Опубликует его в GHCR
3. Подключится к VPS через SSH
4. Обновит контейнеры
5. Запустит миграции
6. Перезапустит бота

**Zero-downtime:** Новые контейнеры запускаются до остановки старых!

---

## 📊 Операционные команды

### Мониторинг

```bash
# Статус контейнеров
docker compose -f docker-compose.prod.yml ps

# Логи в реальном времени
docker compose -f docker-compose.prod.yml logs -f app

# Последние 100 строк логов
docker compose -f docker-compose.prod.yml logs --tail=100 app

# Использование ресурсов
docker stats ononimka-app ononimka-postgres

# Дисковое пространство
df -h
docker system df
```

### Перезапуск

```bash
# Перезапуск только приложения
docker compose -f docker-compose.prod.yml restart app

# Перезапуск всех сервисов
docker compose -f docker-compose.prod.yml restart

# Полная остановка и запуск
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

### Обновление переменных окружения

```bash
cd /opt/ononimka
nano .env
# Измените нужные переменные

# Перезапустите для применения изменений
docker compose -f docker-compose.prod.yml restart app
```

### Backup базы данных

```bash
cd /opt/ononimka

# Создание backup
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U ononimka ononimka > backup_$(date +%Y%m%d_%H%M%S).sql

# Восстановление из backup
cat backup_20250101_120000.sql | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U ononimka ononimka
```

### Доступ к базе данных

```bash
# Подключение к PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U ononimka -d ononimka

# Внутри psql:
\dt              # Список таблиц
\d "User"        # Структура таблицы User
SELECT COUNT(*) FROM "User";  # Количество пользователей
\q               # Выход
```

### Ручные миграции

```bash
# Запуск миграций вручную
docker compose -f docker-compose.prod.yml exec app \
  yarn prisma migrate deploy

# Генерация Prisma клиента
docker compose -f docker-compose.prod.yml exec app \
  yarn prisma generate
```

### Откат к предыдущей версии

```bash
cd /opt/ononimka

# Посмотрите доступные образы
docker images | grep ononimka

# Найдите SHA предыдущего коммита и измените IMAGE_TAG
nano .env
# Измените: IMAGE_TAG=main-abc1234 (SHA из предыдущего коммита)

# Перезапустите
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

---

## 🔧 Troubleshooting

### Контейнер не запускается

```bash
# Проверьте логи
docker compose -f docker-compose.prod.yml logs app

# Проверьте статус
docker compose -f docker-compose.prod.yml ps

# Проверьте Docker daemon
sudo systemctl status docker
```

### Проблемы с подключением к БД

```bash
# Проверьте что PostgreSQL запущен
docker compose -f docker-compose.prod.yml ps postgres

# Проверьте health check
docker inspect ononimka-postgres | grep Health -A 10

# Проверьте сеть
docker compose -f docker-compose.prod.yml exec app ping postgres
```

### Чистка и перезапуск

```bash
# ВНИМАНИЕ: Это удалит ВСЕ данные!
cd /opt/ononimka
docker compose -f docker-compose.prod.yml down -v

# Запустите заново
docker compose -f docker-compose.prod.yml up -d
```

### GitHub Actions не запускается

1. Проверьте что файл [.github/workflows/deploy.yml](.github/workflows/deploy.yml) находится в main ветке
2. Проверьте что все GitHub Secrets настроены
3. Проверьте логи в GitHub Actions

---

## 📈 Рекомендации по обслуживанию

### Ежедневно
- Проверяйте логи на ошибки: `docker compose -f docker-compose.prod.yml logs --tail=100 app`

### Еженедельно
- Проверяйте дисковое пространство: `df -h && docker system df`
- Делайте backup БД

### Ежемесячно
- Обновляйте системные пакеты: `sudo apt update && sudo apt upgrade`
- Удаляйте старые Docker образы: `docker image prune -a`
- Проверяйте логи GitHub Actions

---

## 🎉 Готово!

Ваш бот теперь развернут на VPS с полностью автоматическим CI/CD!

**Что произойдет при следующем push в main:**
1. GitHub Actions соберет новый образ
2. Опубликует в GHCR
3. Подключится к VPS
4. Обновит контейнеры
5. Запустит миграции
6. Перезапустит бота

**Все автоматически! 🚀**

---

## 📞 Поддержка

Если возникли проблемы:
1. Проверьте логи: `docker compose -f docker-compose.prod.yml logs -f app`
2. Проверьте GitHub Actions: Repository → Actions
3. Проверьте статус контейнеров: `docker compose -f docker-compose.prod.yml ps`
