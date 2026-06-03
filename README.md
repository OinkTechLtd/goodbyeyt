# 📺 GoodbyeYT

> **Независимый YouTube-клиент для России** — смотрите YouTube без ограничений через открытые инстансы Piped и Cobalt.

![GoodbyeYT Banner](https://img.shields.io/badge/GoodbyeYT-v1.0.0-red?style=for-the-badge&logo=youtube)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Instances](https://img.shields.io/badge/Instances-Auto--Updated-orange?style=for-the-badge)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-Enabled-2088FF?style=for-the-badge&logo=github-actions)

---

## 🌟 Что это такое?

**GoodbyeYT** — это веб-приложение, которое позволяет смотреть YouTube в России через открытые публичные инстансы [Piped](https://github.com/TeamPiped/Piped) и [Cobalt](https://github.com/imputnet/cobalt). Поиск работает через официальный **YouTube Data API v3** (с вашим личным ключом), а видео стримится через незаблокированные серверы по всему миру.

### ✨ Ключевые возможности

| Функция | Описание |
|---------|----------|
| 🔍 **Полный поиск** | Поиск через YouTube Data API v3 с вашим ключом |
| ▶️ **Собственный плеер** | HLS/MP4 плеер с выбором качества (144p–1080p+) |
| ⏩ **Настраиваемый пропуск** | Кнопки −/+ 5/10/15/20/30 секунд |
| 🌐 **Авто-инстансы** | Робот ежедневно находит рабочие Piped инстансы |
| 📱 **Мобильная версия** | Полностью адаптивный интерфейс |
| 🌙 **Тёмная/светлая тема** | YouTube-стиль |
| 📜 **История просмотров** | Хранится локально в браузере |
| 🔒 **Приватность** | API ключ хранится только в вашем браузере |
| 📊 **Тренды** | Популярные видео на главной странице |
| 💬 **Комментарии** | Комментарии к видео через YouTube API |

---

## 🚀 Быстрый старт

### Требования

- **Node.js** v18 или выше
- **YouTube Data API v3 ключ** (бесплатно, инструкция ниже)
- Git

### Установка

```bash
# 1. Клонировать репозиторий
git clone https://github.com/your-username/goodbyeyt.git
cd goodbyeyt

# 2. Установить зависимости
npm install

# 3. Скопировать конфигурацию
cp .env.example .env

# 4. (Опционально) Запустить поиск инстансов
npm run update-instances

# 5. Запустить сервер
npm start
```

Откройте браузер: **http://localhost:3000**

При первом запуске вас попросят:
1. ✅ Принять условия использования и политику конфиденциальности
2. 🔑 Ввести YouTube API ключ (инструкция появится прямо в приложении)

---

## 🔑 Как получить YouTube API ключ

> Подробный туториал со скриншотами встроен **прямо в приложение** при первом запуске. Ниже — краткая версия.

### Шаг 1: Создать проект в Google Cloud

1. Перейдите на [console.cloud.google.com](https://console.cloud.google.com/)
2. Нажмите **«Выбрать проект»** → **«Новый проект»**
3. Введите название: `GoodbyeYT` → **«Создать»**

### Шаг 2: Включить YouTube Data API v3

1. В меню: **«API и сервисы»** → **«Библиотека»**
2. Найдите `YouTube Data API v3`
3. Нажмите **«Включить»**

### Шаг 3: Создать API ключ

1. **«API и сервисы»** → **«Учётные данные»**
2. **«+ Создать учётные данные»** → **«Ключ API»**
3. Скопируйте созданный ключ

### Шаг 4: Ввести ключ в приложение

Вставьте ключ в форму при первом запуске GoodbyeYT. Ключ сохраняется в localStorage вашего браузера.

> 💡 **Бесплатная квота:** 10 000 единиц/день ≈ 100 поисковых запросов. Этого хватает для личного использования.

---

## 🤖 Поисковый робот инстансов

### Как это работает

GoodbyeYT использует **GitHub Actions** для автоматического поиска и обновления рабочих инстансов:

```
Каждый день в 06:00 МСК
    ↓
Скачивает официальный список Piped с piped-instances.kavin.rocks
    ↓
Скачивает официальный список Cobalt с instances.cobalt.tools
    ↓
Параллельно проверяет все инстансы (~20-40 штук за 6 секунд)
    ↓
Сортирует по скорости (latency)
    ↓
Сохраняет рабочие в data/instances.json
    ↓
Коммитит в репозиторий
    ↓
При следующем запросе сервер использует актуальные инстансы
```

### Запуск вручную

```bash
# Найти и обновить инстансы прямо сейчас
npm run update-instances

# Или только проверить текущие
npm run check-instances
```

### Статистика инстансов

Текущий статус инстансов виден в шапке приложения (зелёная/жёлтая точка).

---

## 📁 Структура проекта

```
goodbyeyt/
├── .github/
│   └── workflows/
│       ├── instance-checker.yml      # Ежедневная проверка инстансов
│       └── emergency-recovery.yml    # Экстренное восстановление
├── data/
│   └── instances.json                # Актуальный список рабочих инстансов
├── public/
│   ├── index.html                    # SPA приложение
│   ├── css/
│   │   └── main.css                  # YouTube-стиль стили
│   └── js/
│       └── app.js                    # Фронтенд логика
├── src/
│   ├── server.js                     # Express сервер
│   ├── routes/
│   │   ├── api.js                    # YouTube API роуты
│   │   └── stream.js                 # Стрим прокси
│   └── utils/
│       ├── instanceManager.js        # Менеджер инстансов
│       └── instanceUpdater.js        # Поисковый робот
├── .env.example                      # Пример конфигурации
├── package.json
└── README.md
```

---

## ⚙️ Конфигурация

```env
# .env

# YouTube API ключ (опционально — можно вводить в UI)
YOUTUBE_API_KEY=AIzaSy...

# Порт сервера
PORT=3000

# Режим (development / production)
NODE_ENV=development

# Таймаут запроса к инстансу (ms)
INSTANCE_TIMEOUT_MS=5000
```

---

## 🐳 Docker (опционально)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```

```bash
docker build -t goodbyeyt .
docker run -p 3000:3000 goodbyeyt
```

---

## 🔧 Технологии

| Компонент | Технология |
|-----------|-----------|
| Backend | Node.js + Express |
| Frontend | Vanilla JS (SPA) |
| Video API | YouTube Data API v3 |
| Streaming | Piped (открытый YT фронтенд) |
| Download | Cobalt API |
| Player | HTML5 Video + HLS.js |
| CI/CD | GitHub Actions |
| Хранилище | localStorage (клиент) |

---

## 🛡️ Безопасность и приватность

- 🔐 **API ключ** хранится только в `localStorage` вашего браузера
- 📡 **Запросы к YouTube** идут через наш сервер-прокси (ваш IP не виден YouTube напрямую)
- 🚫 **Никакой аналитики** — ни Google Analytics, ни трекеров
- 📝 **Логи** — только технические (анонимные IP, без привязки к личности)
- 🔒 **HTTPS** — настройте reverse proxy (nginx/caddy) для продакшена

---

## 📱 Клавиатурные сокращения

| Клавиша | Действие |
|---------|---------|
| `Space` | Пауза / Воспроизведение |
| `←` | Назад на N секунд (настраиваемо) |
| `→` | Вперёд на N секунд (настраиваемо) |
| `↑` | Громче |
| `↓` | Тише |
| `M` | Mute / Unmute |
| `F` | Полноэкранный режим |

---

## 🤝 Участие в разработке

Мы приветствуем вклад сообщества!

1. Fork репозитория
2. Создайте ветку: `git checkout -b feature/my-feature`
3. Сделайте изменения и закоммитьте: `git commit -m 'Add: my feature'`
4. Push: `git push origin feature/my-feature`
5. Откройте Pull Request

### Идеи для улучшения

- [ ] Субтитры / закрытые подписи
- [ ] Плейлисты
- [ ] Подписки на каналы
- [ ] PWA / Service Worker
- [ ] Telegram бот-уведомления об обновлении инстансов
- [ ] Поддержка Invidious инстансов
- [ ] Локализация на другие языки

---

## ⚠️ Отказ от ответственности

GoodbyeYT — независимый некоммерческий проект. Мы не связаны с Google, YouTube или какими-либо государственными структурами. Использование данного программного обеспечения в соответствии с условиями использования YouTube API является вашей ответственностью.

Видеостримы предоставляются публичными Piped-инстансами, которыми управляют независимые волонтёры по всему миру. Доступность контента зависит от работоспособности этих инстансов.

---

## 📄 Лицензия

[MIT License](LICENSE) © 2026 GoodbyeYT Contributors

---

<div align="center">

**Сделано с ❤️ для российских пользователей**



</div>
