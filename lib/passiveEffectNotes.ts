export function parsePassiveEffectNotes(raw: unknown): {
  playerText: string;
  storytellerText: string;
} {
  const text = String(raw ?? "").trim();
  if (!text) return { playerText: "", storytellerText: "" };

  const marker = /\n\s*\[ST\]\s*/i;
  const match = marker.exec(text);
  if (!match || match.index < 0) {
    return { playerText: text, storytellerText: "" };
  }

  const splitAt = match.index;
  const playerText = text.slice(0, splitAt).trim();
  const storytellerText = text.slice(splitAt).replace(/^\s*\[ST\]\s*/i, "").trim();
  return { playerText, storytellerText };
}

export function buildPassiveEffectNotes(playerTextRaw: unknown, storytellerTextRaw: unknown) {
  const playerText = String(playerTextRaw ?? "").trim();
  const storytellerText = String(storytellerTextRaw ?? "").trim();
  if (!storytellerText) return playerText;
  return `${playerText}\n\n[ST] ${storytellerText}`.trim();
}
