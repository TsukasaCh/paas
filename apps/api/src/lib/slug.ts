/**
 * Generator subdomain acak & ramah dibaca (gaya Railway/Heroku/Docker):
 * `swift-otter`, `lunar-harbor`, dst — bukan diturunkan dari nama service,
 * supaya nama publik tidak membocorkan detail internal & selalu unik.
 *
 * ~64 × ~64 = ±4000 kombinasi 2-kata. Bila bentrok, coba beberapa kali; kalau
 * masih bentrok, tambah suffix pendek (tetap enak dibaca).
 */
import { randomBytes, randomInt } from "node:crypto";

const LEFT = [
  "swift", "brave", "calm", "clever", "cosmic", "crimson", "dapper", "eager",
  "fuzzy", "gentle", "jolly", "lucky", "mellow", "nimble", "plucky", "quiet",
  "rapid", "shiny", "silent", "spry", "sunny", "tidy", "vivid", "witty",
  "zesty", "bold", "breezy", "chill", "cozy", "daring", "frosty", "golden",
  "hazy", "ivory", "lunar", "misty", "noble", "olive", "proud", "royal",
  "snowy", "solar", "teal", "urban", "velvet", "wild", "amber", "azure",
  "coral", "jade", "merry", "quick", "brisk", "keen", "spark", "fleet",
  "gleam", "dusk", "dawn", "flint", "onyx", "pearl", "sage", "ruby",
];

const RIGHT = [
  "bunny", "otter", "tiger", "panda", "falcon", "koala", "lemur", "moose",
  "heron", "robin", "willow", "maple", "cedar", "cove", "delta", "dune",
  "fjord", "glade", "harbor", "meadow", "brook", "ember", "comet", "nova",
  "orbit", "pixel", "quartz", "river", "summit", "vertex", "wave", "atlas",
  "cabin", "canyon", "peak", "reef", "ridge", "spring", "grove", "haven",
  "isle", "lagoon", "mesa", "oasis", "prairie", "quarry", "trail", "valley",
  "badger", "cobra", "dingo", "eagle", "ferret", "gecko", "hawk", "ibis",
  "jaguar", "kestrel", "lynx", "marten", "newt", "osprey", "puma", "raven",
];

const pick = <T>(a: T[]): T => a[randomInt(a.length)];

/** Satu kandidat 2-kata. */
export function randomWords(): string {
  return `${pick(LEFT)}-${pick(RIGHT)}`;
}

/**
 * Slug unik. `exists(slug)` mengembalikan true bila sudah dipakai.
 * Percobaan pertama 2-kata polos; kalau bentrok terus, tambah suffix hex.
 */
export async function uniqueSlug(
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const slug = randomWords();
    if (!(await exists(slug))) return slug;
  }
  // Sangat jarang: seluruh percobaan bentrok → jamin unik dengan suffix.
  for (let i = 0; i < 8; i++) {
    const slug = `${randomWords()}-${randomBytes(2).toString("hex")}`;
    if (!(await exists(slug))) return slug;
  }
  return `${randomWords()}-${randomBytes(4).toString("hex")}`;
}
