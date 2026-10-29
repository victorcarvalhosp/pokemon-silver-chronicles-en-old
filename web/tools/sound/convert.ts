// Renders the audio browsers can't play into OGG, leaving the originals alone:
//   .mid -> FluidSynth with the project's soundfont.sf2 (chorus/reverb off,
//           matching mkxp-z's defaults) -> WAV -> oggenc (Ogg Vorbis)
//   .wma -> ffmpeg -> WAV -> oggenc
// Needs: brew install fluid-synth vorbis-tools (ffmpeg for .wma).
// Output: web/.audio-cache/Audio/<same path>.ogg (the dev server prefers it).
//
//   node tools/sound/convert.ts        (from web/; skips up-to-date files)

import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const GAME_ROOT = resolve(import.meta.dirname, "../../..");
const AUDIO = join(GAME_ROOT, "Audio");
const OUT = join(GAME_ROOT, "web", ".audio-cache");
const SOUNDFONT = join(GAME_ROOT, "soundfont.sf2");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const jobs = [...walk(AUDIO)].filter((f) => [".mid", ".midi", ".wma"].includes(extname(f).toLowerCase()));
let done = 0, skipped = 0;
const failed: string[] = [];

async function convert(src: string): Promise<void> {
  const rel = relative(GAME_ROOT, src);
  const out = join(OUT, rel.slice(0, rel.length - extname(rel).length) + ".ogg");
  try {
    if (statSync(out).mtimeMs >= statSync(src).mtimeMs) {
      skipped++;
      return;
    }
  } catch {
    // not converted yet
  }
  mkdirSync(dirname(out), { recursive: true });
  try {
    const wav = join(tmpdir(), `audio-${process.pid}-${Math.random().toString(36).slice(2)}.wav`);
    if (extname(src).toLowerCase() === ".wma") {
      await run("ffmpeg", ["-y", "-loglevel", "error", "-i", src, wav]);
    } else {
      const midi = unwrapRmid(src);
      await run("fluidsynth", ["-ni", "-R", "0", "-C", "0", "-r", "44100", "-F", wav, SOUNDFONT, midi]);
      if (midi !== src) rmSync(midi, { force: true });
    }
    await run("oggenc", ["-Q", "-q", "5", wav, "-o", out]);
    rmSync(wav, { force: true });
    done++;
  } catch (e) {
    failed.push(`${rel}: ${(e as Error).message.split("\n")[0]}`);
  }
}

/** RIFF "RMID" files wrap a standard MIDI file in a "data" chunk; FluidSynth needs the inner file. */
function unwrapRmid(src: string): string {
  const bytes = readFileSync(src);
  if (bytes.toString("latin1", 0, 4) !== "RIFF" || bytes.toString("latin1", 8, 12) !== "RMID") return src;
  const size = bytes.readUInt32LE(16);
  const out = join(tmpdir(), `rmid-${process.pid}-${Math.random().toString(36).slice(2)}.mid`);
  writeFileSync(out, bytes.subarray(20, 20 + size));
  return out;
}

const queue = [...jobs];
await Promise.all(Array.from({ length: Math.max(2, cpus().length - 1) }, async () => {
  for (let src = queue.shift(); src; src = queue.shift()) await convert(src);
}));
console.log(`audio: ${done} converted, ${skipped} up to date, ${failed.length} failed (of ${jobs.length})`);
for (const f of failed) console.log("  " + f);
process.exitCode = failed.length ? 1 : 0;
