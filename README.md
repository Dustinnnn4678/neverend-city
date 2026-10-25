# Neverend City

A 3D city that grows by one structure for every Instagram follower and YouTube subscriber.

- `index.html`, `main.js`, `city-gen.js`, `models.js`, `infra.js`: the website (Three.js, no build step).
- `live.json`: the current numbers (`instagram`, `youtube`, `total`). The site re-reads it every 30 seconds.
- `scripts/update-followers.mjs` + `.github/workflows/update-followers.yml`: every 30 minutes, fetch both counts and update `live.json`. If an API fails the last known number is kept, and numbers never go down.

## Preview locally

```
node serve.cjs
```

Then open http://localhost:8765. Add `?count=2000` to the address to try any size, or use the dev slider that shows on localhost.

## Secrets (Settings > Secrets and variables > Actions)

| Name | What it is |
|---|---|
| `IG_ACCESS_TOKEN` | Instagram long-lived access token (expires every 60 days, renew before then) |
| `YT_API_KEY` | YouTube Data API v3 key (restrict it to the YouTube Data API) |
| `YT_CHANNEL_ID` | Your channel ID (starts with `UC`) |

Never put these in a file or in chat.
