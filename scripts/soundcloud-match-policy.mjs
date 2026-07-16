export function partitionOneToOneMatches(records = []) {
  const groups = new Map();
  for (const record of records) groups.set(record.localTrackId, [...(groups.get(record.localTrackId) || []), record]);
  const matches = [];
  const blocked = [];
  const duplicateGroups = [];
  for (const [localTrackId, items] of groups) {
    if (items.length === 1) { matches.push(items[0]); continue; }
    duplicateGroups.push({ localTrackId, items });
    const canonical = items.filter((item) => item.identity === "soundcloud_id");
    const selected = canonical.length === 1 ? canonical[0] : null;
    if (selected) matches.push(selected);
    for (const item of items) {
      if (item === selected) continue;
      blocked.push({ ...item, confidence: Math.min(item.confidence, 0.79), autoApplyBlocked: "multiple_soundcloud_posts", warnings: [...new Set([...(item.warnings || []), "Más de una publicación SoundCloud coincide con la misma pista local"])] });
    }
  }
  return { matches, blocked, duplicateGroups };
}
