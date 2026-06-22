import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { BASE_URL, DEFAULT_DELAY_MS, USER_AGENT } from './lib/constants.js';
import {
  appendItems,
  buildGuid,
  buildItemXml,
  countItems,
  extractMp3Url,
  fetchContentLength,
  indexGuids,
  sleep,
  updateLastBuildDate,
} from './lib/rss-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FEED_PATH = path.join(ROOT, 'rss-feed.xml');
const MIN_EPISODE = 1;
const MAX_EPISODE = 332;

function parseArgs(argv) {
  const args = {
    delayMs: DEFAULT_DELAY_MS,
    dryRun: false,
    start: MIN_EPISODE,
    end: 42,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--delay-ms') args.delayMs = Number(argv[++i]);
    else if (arg === '--start') args.start = Number(argv[++i]);
    else if (arg === '--end') args.end = Number(argv[++i]);
    else if (arg === '--help') {
      console.log(`Usage: node scripts/backfill.js [--dry-run] [--delay-ms 2000] [--start 1] [--end 42]`);
      process.exit(0);
    }
  }

  return args;
}

async function fetchEpisodeJson(episodeNumber) {
  const url = `${BASE_URL}/podcast/${episodeNumber}?format=json-pretty`;
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30000),
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Episode ${episodeNumber}: GET ${url} returned ${response.status}`);
  }

  const data = await response.json();
  return data.item || data;
}

async function buildBackfillItem({ episodeNumber, item }) {
  const mp3Url = extractMp3Url(item.body);
  if (!mp3Url) {
    throw new Error(`Episode ${episodeNumber}: no MP3 URL found in body`);
  }

  const length = await fetchContentLength(mp3Url);
  const itemXml = buildItemXml(item, { mp3Url, length });
  console.log(`Episode ${episodeNumber}: built item (${mp3Url.slice(0, 80)}..., length=${length})`);
  return itemXml;
}

async function main() {
  const args = parseArgs(process.argv);
  const xml = await fs.readFile(FEED_PATH, 'utf8');
  const existingGuids = indexGuids(xml);
  const initialCount = countItems(xml);

  console.log(`Loaded ${FEED_PATH}`);
  console.log(`Existing items: ${initialCount}, unique GUIDs: ${existingGuids.size}`);
  console.log(`Discovering missing episodes ${args.start}-${args.end}...`);

  const candidates = [];
  for (let episodeNumber = args.start; episodeNumber <= Math.min(args.end, MAX_EPISODE); episodeNumber++) {
    if (episodeNumber > args.start) {
      await sleep(args.delayMs);
    }

    const item = await fetchEpisodeJson(episodeNumber);
    if (!item) {
      console.log(`Episode ${episodeNumber}: not found (404), skipping`);
      continue;
    }

    const guid = buildGuid(item.collectionId, item.id);
    if (existingGuids.has(guid)) {
      console.log(`Episode ${episodeNumber}: already in feed`);
      continue;
    }

    candidates.push({ episodeNumber, item, guid });
  }

  if (candidates.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  console.log(`Backfilling ${candidates.length} episode(s)...`);
  candidates.sort((a, b) => b.episodeNumber - a.episodeNumber);

  const builtItems = [];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (i > 0) {
      await sleep(args.delayMs);
    }
    builtItems.push(await buildBackfillItem(candidate));
  }

  if (args.dryRun) {
    console.log(`Dry run complete. Would append ${builtItems.length} item(s).`);
    return;
  }

  const backupPath = `${FEED_PATH}.bak`;
  await fs.copyFile(FEED_PATH, backupPath);
  console.log(`Backup written to ${backupPath}`);

  let merged = appendItems(xml, builtItems);
  merged = updateLastBuildDate(merged);
  await fs.writeFile(FEED_PATH, merged, 'utf8');

  const finalCount = countItems(merged);
  console.log(`Done. Items: ${initialCount} -> ${finalCount}`);
  console.log(`Added episodes: ${candidates.map((c) => c.episodeNumber).sort((a, b) => a - b).join(', ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
