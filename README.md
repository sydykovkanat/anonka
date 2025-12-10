# 🤖 Ononimka - Telegram Anonymous Messaging Bot

Telegram бот для анонимных сообщений с модерацией, управлением пользователями и поддержкой различных типов контента.

## 📋 Возможности

- ✅ Анонимные и идентифицированные сообщения (личные/групповые)
- ✅ Модерация сообщений с системой одобрения
- ✅ Поддержка различных типов контента: текст, фото, видео, документы, стикеры, голосовые, видео-заметки, анимации
- ✅ Управление пользователями и администраторами
- ✅ Система ответов на сообщения (threading)
- ✅ Ограничение количества сообщений в день
- ✅ Импорт пользователей

## 🛠 Технологический стек

- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Telegram Bot**: Grammy
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions

## 🚀 Быстрый старт

### Локальная разработка

1. **Клонируйте репозиторий**
   ```bash
   git clone https://github.com/your-username/ononimka.git
   cd ononimka
   ```

2. **Установите зависимости**
   ```bash
   yarn install
   ```

3. **Настройте переменные окружения**
   ```bash
   cp .env.example .env
   # Отредактируйте .env и добавьте ваш TELEGRAM_BOT_TOKEN
   ```

4. **Запустите PostgreSQL**
   ```bash
   docker-compose up -d postgres
   ```

5. **Запустите миграции**
   ```bash
   yarn prisma migrate deploy
   ```

6. **Запустите приложение**
   ```bash
   yarn start:dev
   ```

### Развертывание на VPS с CI/CD

**📖 Полная инструкция:** [DEPLOYMENT.md](DEPLOYMENT.md)

**⚡ Быстрая шпаргалка:** [VPS_SETUP.md](VPS_SETUP.md)

#### Краткая инструкция:

1. **На VPS**: Запустите скрипт установки
   ```bash
   curl -o vps-commands.sh https://raw.githubusercontent.com/your-username/ononimka/main/vps-commands.sh
   bash vps-commands.sh
   ```

2. **На VPS**: Создайте `.env` файл в `/opt/ononimka/`

3. **В GitHub**: Настройте 9 Secrets (см. [VPS_SETUP.md](VPS_SETUP.md))

4. **На локальной машине**: Push в main ветку
   ```bash
   git push origin main
   ```

5. **Готово!** GitHub Actions автоматически развернет бота на VPS

## 📦 Доступные команды

```bash
# Разработка
yarn start              # Запуск приложения
yarn start:dev          # Режим watch (авто-перезагрузка)
yarn start:debug        # Debug режим

# Production
yarn build              # Сборка приложения
yarn start:prod         # Запуск production версии

# Тестирование
yarn test               # Unit тесты
yarn test:e2e           # E2E тесты
yarn test:cov           # Покрытие тестами

# База данных
yarn prisma migrate dev    # Создать миграцию
yarn prisma migrate deploy # Применить миграции
yarn prisma generate       # Сгенерировать Prisma Client
yarn prisma studio         # Открыть Prisma Studio

# Качество кода
yarn lint               # ESLint проверка
yarn format             # Prettier форматирование
```

## 🗂 Структура проекта

```
ononimka/
├── .github/
│   └── workflows/
│       └── deploy.yml           # GitHub Actions CI/CD
├── prisma/
│   └── schema.prisma            # Схема БД
├── src/
│   ├── config/                  # Конфигурация приложения
│   ├── telegram/                # Telegram бот логика
│   ├── user/                    # Модуль пользователей
│   ├── message/                 # Модуль сообщений
│   ├── import/                  # Импорт пользователей
│   ├── prisma/                  # Prisma сервис
│   └── main.ts                  # Входная точка
├── docker-compose.yml           # Dev конфигурация
├── docker-compose.prod.yml      # Production конфигурация
├── Dockerfile                   # Docker образ
├── .env.example                 # Пример переменных окружения
├── .env.production.example      # Пример production переменных
├── DEPLOYMENT.md                # Полная инструкция по развертыванию
├── VPS_SETUP.md                 # Быстрая шпаргалка
└── vps-commands.sh              # Скрипт установки на VPS
```

## 🔧 Переменные окружения

```env
# База данных
DATABASE_URL=postgresql://user:password@localhost:5434/ononimka

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Администрирование
ADMIN_USERNAME=your_admin_username
GROUP_CHAT_ID=your_group_chat_id
GROUP_CHAT_LINK=your_group_chat_link

# Настройки приложения
NODE_ENV=development
PORT=3000
MODERATION=false
MAX_MESSAGES_PER_DAY=100
```

## 🐳 Docker

### Разработка
```bash
docker-compose up -d
```

### Production
```bash
docker compose -f docker-compose.prod.yml up -d
```

## 📊 Операционные команды на VPS

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

## 🔄 CI/CD Workflow

```
git push origin main
    ↓
GitHub Actions
    ↓
Build Docker Image
    ↓
Push to GitHub Container Registry
    ↓
SSH to VPS
    ↓
Pull & Deploy
    ↓
✅ Bot Updated!
```

## 📝 База данных

### Модели

- **User**: Пользователи Telegram
- **Message**: Сообщения с модерацией
- **ImportedUser**: Предзагруженные пользователи

### Миграции

```bash
# Создать миграцию
yarn prisma migrate dev --name migration_name

# Применить на production
yarn prisma migrate deploy
```

## 🛡 Безопасность

- Все секреты хранятся в GitHub Secrets
- `.env` файлы не коммитятся в git
- PostgreSQL изолирован в Docker сети
- Firewall настроен на VPS
- Автоматические обновления через CI/CD

## 📈 Мониторинг

### Логи
```bash
docker compose -f docker-compose.prod.yml logs -f app
```

### Ресурсы
```bash
docker stats ononimka-app ononimka-postgres
```

### Дисковое пространство
```bash
docker system df
```

## 🔧 Troubleshooting

См. раздел Troubleshooting в [DEPLOYMENT.md](DEPLOYMENT.md)

## 📄 Лицензия

MIT

## 👨‍💻 Автор

Nur Sydykov (@nur_ksydykov)

---

**📖 Документация:**
- [DEPLOYMENT.md](DEPLOYMENT.md) - Полная инструкция по развертыванию
- [VPS_SETUP.md](VPS_SETUP.md) - Быстрая шпаргалка

**🚀 Развертывание:**
```bash
git push origin main  # И все происходит автоматически!
```
