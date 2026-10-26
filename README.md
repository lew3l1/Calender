# Calender

Адаптивный календарь и список задач: минималистичный тёплый интерфейс, режимы дня/недели/месяца/года, создание событий, чек-лист задач, аккаунт по email, Google OAuth, сброс пароля по почте и PWA-основа для push-уведомлений на iPhone.

## Стек

- React + TypeScript + Vite
- Supabase Auth + PostgreSQL + Row Level Security (RLS)
- PWA + Service Worker + Web Push (VAPID)
- GitHub Actions для GitHub Pages

## Запуск в демо-режиме

1. Установите Node.js 20 или новее.
2. Скопируйте файл .env.example в .env.local.
3. Выполните npm install, затем npm run dev.
4. Без переменных Supabase приложение откроется в демонстрационном режиме. Изменения сохраняются локально в этом браузере и **не синхронизируются** между устройствами.

## Подключение облака Supabase

1. Создайте проект Supabase и выполните SQL из supabase/schema.sql в SQL Editor.
2. Если проект уже создан и данные есть, выполните только новую миграцию `supabase/migrations/202610260001_profile_people_event_media.sql` в SQL Editor — она добавляет профиль, контакты, историю встреч, местоположение, фото и приватное Storage-хранилище. Не пересоздавайте проект и не удаляйте существующие данные.
3. Скопируйте Project URL и publishable key в .env.local:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_PUBLISHABLE_KEY
4. В Authentication → URL Configuration задайте Site URL и добавьте в Redirect URLs адрес локального приложения и адрес опубликованного сайта.
5. В Authentication → Providers включите Google. Создайте OAuth Client в Google Cloud Console и добавьте Client ID/Secret в настройки Google-провайдера Supabase. Redirect URI берите из панели Supabase, а не придумывайте вручную.
6. В Authentication → Email настройте подтверждение email. Для реального запуска настройте SMTP-провайдера, отправителя и шаблоны подтверждения/восстановления. Проверьте, что redirect URL для восстановления ведёт на URL приложения.
7. Перезапустите npm run dev после изменения .env.local. Демо-данные из браузера в Supabase автоматически не переносятся.

### Параметры

VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
VITE_VAPID_PUBLIC_KEY=YOUR_PUBLIC_VAPID_KEY

Ключ publishable/anon разрешено встраивать в клиент **только вместе с корректными RLS-политиками**. Никогда не добавляйте service_role key, VAPID private key, SMTP-пароли или другие секреты в VITE_* переменные, фронтенд, git или логи.

## Push-уведомления

- Сгенерируйте VAPID key pair на доверенной машине/в среде деплоя. Публичный ключ задаётся как VITE_VAPID_PUBLIC_KEY; приватный ключ хранится только в Supabase Edge Function Secrets как VAPID_PRIVATE_KEY.
- Разверните функцию supabase/functions/send-reminders и задайте секреты:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - VAPID_PUBLIC_KEY
  - VAPID_PRIVATE_KEY
  - VAPID_SUBJECT (например, mailto:admin@example.com)
- Оставьте стандартную JWT-проверку Supabase Edge Gateway включённой. Вызывайте функцию из Supabase Cron с service-role JWT, который берётся из Vault/секретов. Функция дополнительно проверяет заголовок Authorization. Храните этот ключ только на сервере, никогда в браузере.
- Настройте Supabase Cron на выполнение функции раз в минуту. Используйте защищённый вызов из Cron/Vault и передавайте service-role key через секрет, не записывая его в SQL-файл репозитория. Функция обрабатывает напоминания с временем срабатывания в последние 5 минут и отмечает их обработанными для защиты от повторов.
- Пуш доступен только после HTTPS и разрешения пользователя. На iPhone требуется iOS/iPadOS 16.4+ и добавление сайта на экран «Домой»; запрос разрешения нужно вызывать после явного нажатия пользователем. Встроенный браузер приложения не гарантирует поддержку push.

## Публикация на GitHub Pages

1. В Settings → Pages выберите GitHub Actions как источник.
2. В Settings → Secrets and variables → Actions добавьте:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_PUBLISHABLE_KEY
   - VITE_VAPID_PUBLIC_KEY (можно оставить пустым до настройки push)
3. На каждом PR и push в main workflow проверит TypeScript и соберёт приложение. Публикация выполняется отдельно, чтобы не падать до включения Pages.
4. В Settings → Secrets and variables → Actions → Variables добавьте repository variable DEPLOY_TO_GITHUB_PAGES со значением true. Без этой переменной workflow будет только проверять сборку.
5. После включения Pages и добавления переменной запустите workflow вручную из Actions на ветке main либо отправьте следующий commit в main.
6. Добавьте опубликованный адрес в Supabase Auth Redirect URLs и OAuth redirect allow-list.

Если вы используете Cloudflare Pages/Netlify, настройте эквивалентные переменные сборки и заголовки безопасности. GitHub Pages не применяет файл _headers.

## Модель безопасности

- Все пользовательские записи имеют user_id и изолированы RLS-политиками по auth.uid().
- В браузере никогда не хранится service_role key. Доступ к чужим событиям не должен даваться ни UI, ни API.
- Service Worker кеширует только оболочку приложения, не auth/API-ответы.
- Push endpoint хранится только у владельца записи; удалённые/истёкшие подписки удаляются отправляющей функцией.
- Используйте HTTPS, подтверждение email, SMTP с хорошей репутацией, обновляйте зависимости и включите защиту от утечки секретов в GitHub.
- До открытого публичного запуска дополнительно проверьте rate limits и CAPTCHA/Turnstile в Supabase Auth, настройте резервное копирование, политику удаления аккаунта и мониторинг. Ни одно приложение не защищается от всех атак одной настройкой.

## Новые разделы и возможности

- Профиль: имя, телефон, день рождения, описание; email остаётся привязан к Auth-аккаунту.
- Люди: контакты с отношением/ролью, телефоном, email и личными заметками.
- История встреч и посещений: название, дата/время, связанный контакт и заметки.
- Отдельная страница задач, полнодневные события, местоположение и до 8 фотографий на событие.
- Фотографии хранятся в приватном Storage bucket `event-photos`, подписанные URL выдаются только для предпросмотра владельцу.

## Текущее ограничение

Это стартовая версия без совместного доступа к календарю, импорта .ics и native iOS-приложения. Повторяющиеся серии событий ещё не реализованы. Демо-данные остаются локальными; для профилей, контактов, истории встреч и приватных фотографий требуется применить SQL-миграцию в существующем проекте Supabase.
