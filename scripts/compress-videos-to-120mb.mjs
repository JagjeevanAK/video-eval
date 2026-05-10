#!/usr/bin/env node

import { cpus } from "node:os";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, open, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

const VIDEO_EXTENSIONS = new Set([
  ".3g2",
  ".3gp",
  ".avi",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp4",
  ".mpeg",
  ".mpg",
  ".webm",
  ".wmv",
]);

const DEFAULT_TARGET_MB = 120;
const BYTES_PER_MB = 1024 * 1024;

function parseArgs(argv) {
  const options = {
    input: "videos",
    output: null,
    suffix: "-compressed",
    targetMb: DEFAULT_TARGET_MB,
    concurrency: Math.max(1, Math.min(2, Math.floor(cpus().length / 2))),
    maxWidth: 1280,
    audioKbps: 96,
    replace: false,
    dryRun: false,
    overwrite: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--input" || arg === "-i") {
      options.input = requireValue(arg, next);
      index += 1;
    } else if (arg === "--output" || arg === "-o") {
      options.output = requireValue(arg, next);
      index += 1;
    } else if (arg === "--suffix") {
      options.suffix = requireValue(arg, next);
      index += 1;
    } else if (arg === "--target-mb") {
      options.targetMb = Number(requireValue(arg, next));
      index += 1;
    } else if (arg === "--concurrency" || arg === "-c") {
      options.concurrency = Number.parseInt(requireValue(arg, next), 10);
      index += 1;
    } else if (arg === "--max-width") {
      options.maxWidth = Number.parseInt(requireValue(arg, next), 10);
      index += 1;
    } else if (arg === "--audio-kbps") {
      options.audioKbps = Number.parseInt(requireValue(arg, next), 10);
      index += 1;
    } else if (arg === "--replace") {
      options.replace = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--overwrite") {
      options.overwrite = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.targetMb) || options.targetMb <= 0) {
    throw new Error("--target-mb must be a positive number.");
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency <= 0) {
    throw new Error("--concurrency must be a positive integer.");
  }
  if (!Number.isInteger(options.maxWidth) || options.maxWidth <= 0) {
    throw new Error("--max-width must be a positive integer.");
  }
  if (!Number.isInteger(options.audioKbps) || options.audioKbps <= 0) {
    throw new Error("--audio-kbps must be a positive integer.");
  }
  if (!options.suffix) {
    throw new Error("--suffix must not be empty.");
  }
  if (options.replace) {
    options.output = options.input;
  }

  return options;
}

function requireValue(arg, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value.`);
  }
  return value;
}

function printHelp() {
  console.log(`
Compress videos larger than a target size while leaving smaller videos alone.

Usage:
  npm run compress:videos -- [options]

Options:
  -i, --input <dir>          Source directory. Default: videos
  -o, --output <dir>         Optional output directory. Default: same directory as source
      --suffix <text>        Suffix for same-directory copies. Default: -compressed
      --target-mb <number>   Target size in MiB. Default: 120
  -c, --concurrency <n>      Parallel ffmpeg jobs. Default: ${Math.max(1, Math.min(2, Math.floor(cpus().length / 2)))}
      --max-width <pixels>   Downscale width when wider. Default: 1280
      --audio-kbps <kbps>    Output audio bitrate. Default: 96
      --replace              Replace large originals after successful encode
      --overwrite            Overwrite existing compressed outputs
      --dry-run              Print what would happen without encoding
  -h, --help                 Show this help
`);
}

async function listVideos(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return listVideos(path);
      }
      if (entry.isFile() && VIDEO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        return [path];
      }
      return [];
    }),
  );

  return files.flat();
}

async function dedupeByRealPath(files) {
  const seen = new Set();
  const unique = [];
  let duplicateCount = 0;

  for (const file of files) {
    const resolved = await realpath(file);
    if (seen.has(resolved)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(resolved);
    unique.push(file);
  }

  return { unique, duplicateCount };
}

async function probeDurationSeconds(file) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);

  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not determine duration for ${file}`);
  }
  return duration;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with ${code}\n${stderr}`));
      }
    });
  });
}

function outputPathFor(file, options) {
  if (options.replace) {
    return file;
  }

  const extension = extname(file);
  const outputName = `${basename(file, extension)}${options.suffix}${extension}`;

  if (!options.output) {
    return join(dirname(file), outputName);
  }

  return join(options.output, relative(options.input, dirname(file)), outputName);
}

function formatBytes(bytes) {
  return `${(bytes / BYTES_PER_MB).toFixed(2)} MiB`;
}

function computeVideoKbps(targetBytes, durationSeconds, audioKbps, safetyFactor) {
  const totalKbps = (targetBytes * 8) / durationSeconds / 1000;
  return Math.max(150, Math.floor(totalKbps * safetyFactor - audioKbps));
}

async function compressVideo(file, options) {
  const sourceStat = await stat(file);
  const targetBytes = Math.floor(options.targetMb * BYTES_PER_MB);
  const extension = extname(file);
  const nameWithoutExtension = basename(file, extension);

  if (!options.replace && nameWithoutExtension.endsWith(options.suffix)) {
    return {
      status: "skipped",
      file,
      reason: "already looks like a compressed copy",
    };
  }

  if (sourceStat.size <= targetBytes) {
    return {
      status: "skipped",
      file,
      reason: `${formatBytes(sourceStat.size)} is already <= ${formatBytes(targetBytes)}`,
    };
  }

  const output = outputPathFor(file, options);
  if (!options.replace && existsSync(output) && !options.overwrite) {
    return {
      status: "skipped",
      file,
      reason: `output already exists: ${output}`,
    };
  }

  const duration = await probeDurationSeconds(file);
  const lockFile = `${output}.compressing.lock`;
  let lockHandle;

  if (!options.dryRun) {
    await mkdir(dirname(output), { recursive: true });

    try {
      lockHandle = await open(lockFile, "wx");
      await lockHandle.writeFile(
        `pid=${process.pid}\nsource=${file}\noutput=${output}\nstarted=${new Date().toISOString()}\n`,
      );
    } catch (error) {
      if (error.code === "EEXIST") {
        return {
          status: "skipped",
          file,
          reason: `another compression is already running for ${output}`,
        };
      }
      throw error;
    }

    if (!options.replace && existsSync(output) && !options.overwrite) {
      await lockHandle.close();
      await rm(lockFile, { force: true });
      lockHandle = undefined;
      return {
        status: "skipped",
        file,
        reason: `output already exists: ${output}`,
      };
    }
  }

  const tempBase = join(
    tmpdir(),
    `video-compress-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const tempOutput = `${tempBase}${extname(file).toLowerCase() || ".mp4"}`;
  const passLog = `${tempBase}-pass`;
  const filter = `scale=w='min(${options.maxWidth},iw)':h=-2`;

  if (options.dryRun) {
    const videoKbps = computeVideoKbps(targetBytes, duration, options.audioKbps, 0.94);
    return {
      status: "dry-run",
      file,
      reason: `${formatBytes(sourceStat.size)} -> target ${formatBytes(targetBytes)}, video bitrate about ${videoKbps}k`,
    };
  }

  let finalSize = Number.POSITIVE_INFINITY;
  let selectedVideoKbps = 0;
  let attempt = 0;

  try {
    for (const safetyFactor of [0.94, 0.9, 0.86]) {
      attempt += 1;
      selectedVideoKbps = computeVideoKbps(targetBytes, duration, options.audioKbps, safetyFactor);

      await rm(tempOutput, { force: true });
      await rm(`${passLog}-0.log`, { force: true });
      await rm(`${passLog}-0.log.mbtree`, { force: true });

      await run("ffmpeg", [
        "-y",
        "-i",
        file,
        "-vf",
        filter,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-b:v",
        `${selectedVideoKbps}k`,
        "-pass",
        "1",
        "-passlogfile",
        passLog,
        "-an",
        "-f",
        "null",
        "/dev/null",
      ]);

      await run("ffmpeg", [
        "-y",
        "-i",
        file,
        "-vf",
        filter,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-b:v",
        `${selectedVideoKbps}k`,
        "-pass",
        "2",
        "-passlogfile",
        passLog,
        "-c:a",
        "aac",
        "-b:a",
        `${options.audioKbps}k`,
        "-movflags",
        "+faststart",
        tempOutput,
      ]);

      finalSize = (await stat(tempOutput)).size;
      if (finalSize <= targetBytes) {
        break;
      }
    }

    if (options.replace) {
      const backup = `${file}.original`;
      await rename(file, backup);
      await rename(tempOutput, file);
      await rm(backup, { force: true });
    } else {
      if (options.overwrite) {
        await rm(output, { force: true });
      }
      await rename(tempOutput, output);
    }

    return {
      status: finalSize <= targetBytes ? "compressed" : "compressed-over-target",
      file,
      output,
      reason: `${formatBytes(sourceStat.size)} -> ${formatBytes(finalSize)} at ${selectedVideoKbps}k video bitrate after ${attempt} attempt(s)`,
    };
  } finally {
    if (lockHandle) {
      await lockHandle.close();
      await rm(lockFile, { force: true });
    }
    await rm(tempOutput, { force: true });
    await rm(`${passLog}-0.log`, { force: true });
    await rm(`${passLog}-0.log.mbtree`, { force: true });
  }
}

async function runQueue(items, concurrency, worker) {
  const results = [];
  let nextIndex = 0;

  async function next() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => next()),
  );
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const scriptPath = fileURLToPath(import.meta.url);
  const inputExists = existsSync(options.input);

  if (!inputExists) {
    throw new Error(`Input directory does not exist: ${options.input}`);
  }

  const discoveredVideos = await listVideos(options.input);
  const { unique: videos, duplicateCount } = await dedupeByRealPath(discoveredVideos);
  console.log(`Script: ${scriptPath}`);
  console.log(`Input: ${options.input}`);
  console.log(
    `Output: ${options.replace ? "replace originals" : options.output || `same directory with ${options.suffix} suffix`}`,
  );
  console.log(`Target: ${options.targetMb} MiB`);
  console.log(`Concurrency: ${options.concurrency}`);
  console.log(`Videos found: ${videos.length}`);
  if (duplicateCount > 0) {
    console.log(`Duplicate paths skipped before queueing: ${duplicateCount}`);
  }

  const results = await runQueue(videos, options.concurrency, async (file, index) => {
    const label = `[${index + 1}/${videos.length}] ${file}`;
    try {
      console.log(`${label} starting`);
      const result = await compressVideo(file, options);
      console.log(`${label} ${result.status}: ${result.reason}`);
      return result;
    } catch (error) {
      console.error(`${label} failed: ${error.message}`);
      return { status: "failed", file, reason: error.message };
    }
  });

  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});

  console.log("Done:", counts);

  if (counts.failed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
