# The Rabbi Orlofsky Show — Full RSS Feed

Squarespace caps podcast RSS feeds at **300 items**. This repo hosts the complete feed on GitHub Pages and keeps it current with new episodes from Squarespace.

## The problem

The show has 330+ episodes, but Squarespace only exposes the **most recent 300** in its RSS feed (`/podcast?format=rss`). Episodes 1–42 fell off the feed entirely. Podcast apps and directories subscribing to the Squarespace URL never see the full archive.

## The solution

1. **Full feed on GitHub Pages** — `rss-feed.xml` in this repo is the canonical feed, backfilled with all missing episodes.
2. **Squarespace redirect** — A 301 on the old RSS URL sends podcast clients to this feed. The GitHub feed also includes `<itunes:new-feed-url>` pointing at itself (see [Feed migration](#feed-migration) below).
3. **Daily sync** — A GitHub Action fetches the 20 most recent posts from Squarespace's JSON API and prepends any new episodes by GUID (existing items are never removed or replaced).

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

## Feed migration

### What Apple recommends

[Apple's guidance for changing a feed URL](https://podcasters.apple.com/support/837-change-the-rss-feed-url) recommends **both**:

1. **HTTP 301** on the old feed URL — works for Apple Podcasts and most other podcast apps.
2. **`<itunes:new-feed-url>`** in the **new** feed, pointing at the new feed URL — gives Apple an explicit, permanent migration signal.

Keep the 301 redirect in place for **at least four weeks** (longer is fine). The tag on the GitHub feed is harmless to leave in place permanently; the daily merge script maintains it via `ensureNewFeedUrl()`.

If you use a host that only supports one mechanism, a 301 alone is usually enough for Apple. This project uses both because the new feed is self-hosted on GitHub Pages.

### Squarespace setup

Use a **URL Mapping** so only the RSS URL redirects — not the podcast page visitors browse:

```
/podcast?format=rss  →  https://aribennett1.github.io/rabbi-orlofsky-show-rss/rss-feed.xml  (301)
```

`/podcast` without `?format=rss` should stay on Squarespace (200). That is expected and desired.

Optionally, also use **Pages → Podcast → Settings → Feeds → Podcasting → Change Feed → Moving from Squarespace** and enter the GitHub feed URL. That adds `<itunes:new-feed-url>` to the old Squarespace feed XML as a backup signal for Apple clients that fetch the feed before following the redirect.

### Verify

```bash
# Should 301 to GitHub
curl -sI 'https://www.rabbiorlofsky.com/podcast?format=rss' | grep -i location

# Should stay on Squarespace
curl -sI 'https://www.rabbiorlofsky.com/podcast' | head -1
```
