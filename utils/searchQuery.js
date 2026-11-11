const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Every word must appear in at least one field, in any order ("golf r" finds "Golf 8.5R").
// One- and two-character words must not sit inside another word, so "r" matches "8.5R" or
// "Golf R" but not every title containing the letter r.
export const searchTermClauses = (search, fields) => {
  const words = String(search || '').trim().split(/\s+/).filter(Boolean).slice(0, 8);
  return words.map(word => {
    const escaped = escapeRegex(word);
    const pattern = word.length <= 2 ? `(^|[^a-z])${escaped}([^a-z]|$)` : escaped;
    return { $or: fields.map(field => ({ [field]: { $regex: pattern, $options: 'i' } })) };
  });
};
