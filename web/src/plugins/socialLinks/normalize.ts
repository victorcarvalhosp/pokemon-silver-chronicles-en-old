// pbNormalizeStringForMatching (Plugins/Social Links/003_SocialUI.rb:6), on
// its own so the profile data (001_Data.rb's phone matching) and the global
// helpers can both use it without importing each other.

const ACCENTS: Record<string, string> = {
  "á": "a", "à": "a", "â": "a", "ä": "a", "ã": "a", "å": "a",
  "é": "e", "è": "e", "ê": "e", "ë": "e",
  "í": "i", "ì": "i", "î": "i", "ï": "i",
  "ó": "o", "ò": "o", "ô": "o", "ö": "o", "õ": "o",
  "ú": "u", "ù": "u", "û": "u", "ü": "u",
  "ñ": "n", "ç": "c",
  "Á": "A", "À": "A", "Â": "A", "Ä": "A", "Ã": "A", "Å": "A",
  "É": "E", "È": "E", "Ê": "E", "Ë": "E",
  "Í": "I", "Ì": "I", "Î": "I", "Ï": "I",
  "Ó": "O", "Ò": "O", "Ô": "O", "Ö": "O", "Õ": "O",
  "Ú": "U", "Ù": "U", "Û": "U", "Ü": "U",
  "Ñ": "N", "Ç": "C",
};

/** String#strip: ASCII whitespace (and trailing NULs) only, unlike String#trim. */
function rubyStrip(s: string): string {
  return s.replace(/^[\t\n\v\f\r ]+/, "").replace(/[\0\t\n\v\f\r ]+$/, "");
}

/** Ruby's /[[:space:]]/ on a UTF-8 string (Unicode White_Space). */
const SPACE = /[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g;

/** Helper function to normalize strings by removing accents and special characters. */
export function pbNormalizeStringForMatching(str: unknown): string {
  // Convert to string, strip whitespace
  let normalized = rubyStrip(str == null ? "" : String(str));
  // Replace accented characters with their base equivalents
  for (const [accented, plain] of Object.entries(ACCENTS)) normalized = normalized.split(accented).join(plain);
  // Normalize whitespace (replace any whitespace with single space)
  normalized = normalized.replace(SPACE, " ").replace(/ {2,}/g, " ");
  // Convert to lowercase
  return normalized.toLowerCase();
}
