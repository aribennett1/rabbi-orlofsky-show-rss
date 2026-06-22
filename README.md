# The Rabbi Orlofsky Show — Full RSS Feed

Squarespace caps podcast RSS feeds at **300 items**. This repo hosts the complete feed on GitHub Pages and keeps it current with new episodes from Squarespace.

## The problem

The show has 330+ episodes, but Squarespace only exposes the **most recent 300** in its RSS feed (`/podcast?format=rss`). Episodes 1–42 fell off the feed entirely. Podcast apps and directories subscribing to the Squarespace URL never see the full archive.

## The solution

1. **Full feed on GitHub Pages** — `rss-feed.xml` in this repo is the canonical feed, backfilled with all missing episodes.
2. **Squarespace redirect** — In podcast page settings (Feeds → Change Feed), point the old Squarespace RSS URL to this feed. Squarespace issues a 301; Apple Podcasts and other clients follow it automatically.
3. **Daily sync** — A GitHub Action fetches the 20 most recent posts from Squarespace's JSON API and merges them into the feed by GUID (prepend new, update existing, never remove).

## Feed URL

After enabling GitHub Pages on the `main` branch:

```
https://aribennett1.github.io/rabbi-orlofsky-show-rss/rss-feed.xml
```

## Scripts

```bash
# One-time backfill of missing episodes (already done)
npm run backfill

# Sync recent episodes from Squarespace JSON
npm run merge
```

## GitHub Action

The workflow in `.github/workflows/update-rss.yml` runs daily at **9:01 AM EST** (14:01 UTC) and can be triggered manually from the Actions tab.

## Squarespace redirect

Do **not** use URL Mappings for this. Use:

**Pages → Podcast → Settings → Feeds → Podcasting → Change Feed → Moving from Squarespace**

Enter the GitHub Pages feed URL above. Keep the redirect in place for at least four weeks after switching.
