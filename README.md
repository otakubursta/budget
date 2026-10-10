# Budget

Локально: правый клик по public/index.html → Open with Live Server (данные в браузере).

Облако (Cloudflare Workers + D1):
1. Создайте базу D1 `budget`, выполните schema.sql в Console.
2. Вставьте database_id в wrangler.toml.
3. Подключите репозиторий в Workers & Pages (Deploy command: npx wrangler deploy).
4. Settings -> Variables and secrets -> Secret APP_PASSWORD (логин admin).
5. Domains: включите workers.dev.
