# Rabbi Orlofsky Podcast RSS Feeds

Squarespace caps podcast RSS feeds at **300 items**. This repo hosts complete feeds on GitHub Pages and keeps them current with new episodes from Squarespace.

## The problem

The main show has 330+ episodes, but Squarespace only exposes the **most recent 300** in its RSS feed (`/podcast?format=rss`). Episodes 1–42 fell off the feed entirely. Podcast apps and directories subscribing to the Squarespace URL never see the full archive.

The same 300-item cap applies to other podcasts on the site. As those feeds grow, episodes can disappear from the Squarespace RSS URL even though they remain on the website.

## The solution

1. **Full feeds on GitHub Pages** — XML files in this repo are the canonical feeds, with complete archives where needed.
2. **Squarespace redirects** — 301s on the old RSS URLs send podcast clients to GitHub Pages. Each synced feed includes `<itunes:new-feed-url>` pointing at itself (see [Feed migration](#feed-migration) below).
3. **Daily sync** — Google Apps Script triggers a GitHub Action daily at **9:02 AM Eastern**, which runs `merge-feed.js`. The script fetches the 20 most recent posts from each Squarespace collection's JSON API and prepends any new episodes by GUID. Existing items are never removed or replaced.

## Feeds

After enabling GitHub Pages on the `main` branch:

| Feed | File | Squarespace source |
|------|------|--------------------|
| [The Rabbi Orlofsky Show](https://aribennett1.github.io/rabbi-orlofsky-show-rss/rss-feed.xml) | `rss-feed.xml` | [/podcast](https://www.rabbiorlofsky.com/podcast) |
| [Parasha in 5](https://aribennett1.github.io/rabbi-orlofsky-show-rss/parsha-in-5.xml) | `parsha-in-5.xml` | [/parasha-in-5](https://www.rabbiorlofsky.com/parasha-in-5) |
| [Q&A Podcast](https://aribennett1.github.io/rabbi-orlofsky-show-rss/q-and-a.xml) | `q-and-a.xml` | [/qa-podcast](https://www.rabbiorlofsky.com/qa-podcast) |
| [Theme Song](https://aribennett1.github.io/rabbi-orlofsky-show-rss/theme-song.xml) | `theme-song.xml` | *(static — not synced)* |

Base URL:

```
https://aribennett1.github.io/rabbi-orlofsky-show-rss/
```

## Scripts

```bash
# One-time backfill of missing main-show episodes (already done)
npm run backfill

# Sync recent episodes from Squarespace JSON into all three podcast feeds
npm run merge
```

`merge-feed.js` processes each feed listed in `scripts/lib/constants.js` (`MERGE_FEEDS`). Pass `--dry-run` to preview changes without writing files.

## GitHub Action

The workflow in `.github/workflows/update-rss.yml` is triggered by `workflow_dispatch` — either manually from the Actions tab or by an external scheduler. A Google Apps Script time-driven trigger calls the GitHub API daily at **9:02 AM Eastern**.

The workflow merges `rss-feed.xml`, `parsha-in-5.xml`, and `q-and-a.xml`, then commits and pushes if any changed.

To trigger manually via API:

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/aribennett1/rabbi-orlofsky-show-rss/actions/workflows/update-rss.yml/dispatches \
  -d '{"ref":"main"}'
```

The token needs **Actions: Read and write** on this repository (fine-grained PAT recommended). Store it in the Apps Script project's Script Properties as `GITHUB_TOKEN`, not in source code.

## Feed migration

### What Apple recommends

[Apple's guidance for changing a feed URL](https://podcasters.apple.com/support/837-change-the-rss-feed-url) recommends **both**:

1. **HTTP 301** on the old feed URL — works for Apple Podcasts and most other podcast apps.
2. **`<itunes:new-feed-url>`** in the **new** feed, pointing at the new feed URL — gives Apple an explicit, permanent migration signal.

Keep the 301 redirect in place for **at least four weeks** (longer is fine). The tag on the GitHub feed is harmless to leave in place permanently; the daily merge script maintains it via `ensureNewFeedUrl()`.

If you use a host that only supports one mechanism, a 301 alone is usually enough for Apple. This project uses both because the new feeds are self-hosted on GitHub Pages.

### Squarespace setup

Use **URL Mappings** so only the RSS URLs redirect — not the podcast pages visitors browse:

```
/podcast?format=rss        →  https://aribennett1.github.io/rabbi-orlofsky-show-rss/rss-feed.xml       (301)
/parasha-in-5?format=rss   →  https://aribennett1.github.io/rabbi-orlofsky-show-rss/parsha-in-5.xml   (301)
/qa-podcast?format=rss     →  https://aribennett1.github.io/rabbi-orlofsky-show-rss/q-and-a.xml       (301)
```

Each path without `?format=rss` should stay on Squarespace (200). That is expected and desired.

Optionally, also use **Pages → Podcast → Settings → Feeds → Podcasting → Change Feed → Moving from Squarespace** and enter the GitHub feed URL. That adds `<itunes:new-feed-url>` to the old Squarespace feed XML as a backup signal for Apple clients that fetch the feed before following the redirect.

### Verify

```bash
# Should 301 to GitHub
curl -sI 'https://www.rabbiorlofsky.com/podcast?format=rss' | grep -i location
curl -sI 'https://www.rabbiorlofsky.com/parasha-in-5?format=rss' | grep -i location
curl -sI 'https://www.rabbiorlofsky.com/qa-podcast?format=rss' | grep -i location

# Should stay on Squarespace
curl -sI 'https://www.rabbiorlofsky.com/podcast' | head -1
curl -sI 'https://www.rabbiorlofsky.com/parasha-in-5' | head -1
curl -sI 'https://www.rabbiorlofsky.com/qa-podcast' | head -1
```
