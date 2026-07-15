# Cloudflare Containers Deploy

This app is a Flask backend with ffmpeg, background jobs, uploads, and external API keys. Use Cloudflare Containers, not plain Pages/Workers.

## First Deploy

1. Install dependencies:

```sh
npm install
```

2. Log in:

```sh
npx wrangler login
```

3. Add secrets:

```sh
npx wrangler secret put FLASK_SECRET
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ARK_API_KEY
npx wrangler secret put TOS_AK
npx wrangler secret put TOS_SK
npx wrangler secret put NANO_GPT_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

4. Deploy:

```sh
npm run deploy:cloudflare
```

5. Check container status:

```sh
npm run cf:containers
```

## Notes

- Docker must be running locally when deploying.
- Cloudflare Containers require a Workers Paid plan.
- `max_instances = 1` keeps in-memory job polling on the same container. Supabase is still recommended because container-local files are not a durable database.
- `instance_type = "basic"` is a cost-conscious starting point. If ffmpeg jobs fail from memory or disk pressure, raise it to `standard-1`.
