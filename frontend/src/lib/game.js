// Shared Wordle helpers used by Solo, Daily and Room pages

export const MAX_ATTEMPTS = 6;

export const mergeUsedLetters = (used, guess, result) => {
  const next = { ...used };
  guess.split("").forEach((ch, i) => {
    const status = result[i];
    if (status === "correct") next[ch] = "correct";
    else if (status === "present" && next[ch] !== "correct") next[ch] = "present";
    else if (status === "absent" && !next[ch]) next[ch] = "absent";
  });
  return next;
};

// Maps a physical keyboard event to a game key, or null
export const keyFromEvent = (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === "Enter") return "ENTER";
  if (e.key === "Backspace") return "BACKSPACE";
  const ch = e.key.toLocaleUpperCase("az");
  return /^[A-ZƏÖÜÇŞĞİI]$/.test(ch) ? ch : null;
};
