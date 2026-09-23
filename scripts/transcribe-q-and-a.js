import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { USER_AGENT } from './lib/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FEED_PATH = path.join(ROOT, 'q-and-a.xml');
const OUTPUT_DIR = path.join(ROOT, 'Transcriptions');
const TEMP_DIR = path.join(OUTPUT_DIR, '.tmp');
const LOCAL_MLX_WHISPER = path.join(ROOT, '.venv', 'bin', 'mlx_whisper');
const DEFAULT_MODEL = 'mlx-community/whisper-large-v3-turbo';

function parseArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    limit: Infinity,
    model: DEFAULT_MODEL,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg === '--model') args.model = argv[++i];
    else if (arg === '--help') {
      console.log(`Usage: node scripts/transcribe-q-and-a.js [--dry-run] [--force] [--limit 1] [--model ${DEFAULT_MODEL}]`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.limit) || args.limit < 1) {
    args.limit = Infinity;
  }

  return args;
}

function decodeXml(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function extractTag(itemXml, tagName) {
  const match = itemXml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? decodeXml(match[1]).trim() : '';
}

function extractEnclosureUrl(itemXml) {
  const match = itemXml.match(/<enclosure\b[^>]*\burl="([^"]+)"/i);
  return match ? decodeXml(match[1]).trim() : '';
}

function sanitizeFilePart(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function parseEpisodes(xml) {
  const newestFirst = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  return newestFirst.reverse().map((itemXml, index) => {
    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const audioUrl = extractEnclosureUrl(itemXml);
    const episodeNumber = index + 1;
    const filename = `${episodeNumber} - ${sanitizeFilePart(title)}.txt`;

    return {
      audioUrl,
      episodeNumber,
      filename,
      link,
      title,
      transcriptPath: path.join(OUTPUT_DIR, filename),
    };
  });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findMlxWhisper() {
  if (await exists(LOCAL_MLX_WHISPER)) {
    return LOCAL_MLX_WHISPER;
  }
  return 'mlx_whisper';
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    throw new Error(`GET ${url} returned ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, buffer);
}

async function transcribeEpisode(episode, args) {
  const tempBase = `episode-${String(episode.episodeNumber).padStart(4, '0')}`;
  const audioPath = path.join(TEMP_DIR, `${tempBase}.mp3`);
  const rawTranscriptPath = path.join(TEMP_DIR, `${tempBase}.txt`);

  console.log(`\n=== ${episode.filename} ===`);
  console.log(`Downloading ${episode.audioUrl}`);
  await downloadFile(episode.audioUrl, audioPath);

  await fs.rm(rawTranscriptPath, { force: true });
  await run(args.mlxWhisperCommand, [
    audioPath,
    '--model',
    args.model,
    '--output-dir',
    TEMP_DIR,
    '--output-format',
    'txt',
    '--output-name',
    tempBase,
  ]);

  const transcript = await fs.readFile(rawTranscriptPath, 'utf8');
  const body = [
    `[${episode.title}](${episode.link})`,
    '',
    transcript.trim(),
    '',
  ].join('\n');

  await fs.writeFile(episode.transcriptPath, body, 'utf8');
  await fs.rm(audioPath, { force: true });
  await fs.rm(rawTranscriptPath, { force: true });
  console.log(`Wrote ${path.relative(ROOT, episode.transcriptPath)}`);
}

async function main() {
  const args = parseArgs(process.argv);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(TEMP_DIR, { recursive: true });

  const xml = await fs.readFile(FEED_PATH, 'utf8');
  const episodes = parseEpisodes(xml).filter((episode) => episode.title && episode.link && episode.audioUrl);
  const missing = [];

  for (const episode of episodes) {
    if (!args.force && await exists(episode.transcriptPath)) {
      continue;
    }
    missing.push(episode);
  }

  const selected = missing.slice(0, args.limit);
  console.log(`Q&A episodes in feed: ${episodes.length}`);
  console.log(args.force ? `Transcribing ${selected.length} episode(s)` : `Missing transcripts: ${missing.length}`);

  if (args.dryRun) {
    for (const episode of selected) {
      console.log(`${path.relative(ROOT, episode.transcriptPath)} <- ${episode.link}`);
    }
    return;
  }

  try {
    args.mlxWhisperCommand = await findMlxWhisper();
  } catch {
    throw new Error('mlx_whisper is not installed. Run: npm run setup:transcribe');
  }

  for (const episode of selected) {
    await transcribeEpisode(episode, args);
  }

  if (selected.length === 0) {
    console.log('Nothing to transcribe.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
