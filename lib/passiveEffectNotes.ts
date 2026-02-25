export function parsePassiveEffectNotes(raw: unknown): {
  playerText: string;
  storytellerText: string;
  saveTriggerEnabled: boolean;
} {
  const text = String(raw ?? "").trim();
  if (!text) return { playerText: "", storytellerText: "", saveTriggerEnabled: false };

  const marker = /\n\s*\[ST\]\s*/i;
  const match = marker.exec(text);
  if (!match || match.index < 0) {
    return { playerText: text, storytellerText: "", saveTriggerEnabled: false };
  }

  const splitAt = match.index;
  const playerText = text.slice(0, splitAt).trim();
  const storytellerRaw = text.slice(splitAt).replace(/^\s*\[ST\]\s*/i, "").trim();
  const saveTriggerEnabled = /\[SAVE_TRIGGER\]/i.test(storytellerRaw);
  const storytellerText = storytellerRaw.replace(/\[SAVE_TRIGGER\]/gi, "").trim();
  return { playerText, storytellerText, saveTriggerEnabled };
}

export function buildPassiveEffectNotes(
  playerTextRaw: unknown,
  storytellerTextRaw: unknown,
  saveTriggerEnabledRaw?: unknown
) {
  const playerText = String(playerTextRaw ?? "").trim();
  const storytellerText = String(storytellerTextRaw ?? "").trim();
  const saveTriggerEnabled = Boolean(saveTriggerEnabledRaw);
  if (!storytellerText && !saveTriggerEnabled) return playerText;
  const stCombined = [storytellerText, saveTriggerEnabled ? "[SAVE_TRIGGER]" : ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  return `${playerText}\n\n[ST] ${stCombined}`.trim();
}
