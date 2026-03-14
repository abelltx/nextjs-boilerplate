export type MapMarker = {
  id: string;
  label: string;
  x: number;
  y: number;
  targetBlockId: string | null;
};

export type HexMarker = MapMarker & {
  focusImageUrl?: string | null;
  checkKey?: string | null;
  checkDc?: number | null;
  rewardItemIds?: string[];
  requiredQuestIds?: string[];
  playerText?: string | null;
  storytellerNotes?: string | null;
  checkPrompts?: Array<{
    id: string;
    label?: string | null;
    checkKey: string;
    dc: number | null;
    storytellerScript?: string | null;
    notes?: string | null;
  }>;
  rollOutcomes?: Array<{
    id: string;
    minRoll: number | null;
    maxRoll: number | null;
    label: string;
    storytellerScript: string;
    notes?: string | null;
  }>;
};

export type RuntimeBlock = {
  id: string;
  sort_order: number;
  block_type: string;
  audience: string;
  mode: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  meta?: any;
};

export function isSceneBlock(b: RuntimeBlock) {
  return String(b.block_type).toLowerCase() === "scene";
}

export function isPresentableBlock(b: RuntimeBlock) {
  return String(b.audience).toLowerCase() !== "storyteller";
}

export function extractMapMarkers(meta: any): MapMarker[] {
  const list = Array.isArray(meta?.markers) ? meta.markers : [];
  return list
    .map((m: any, i: number) => ({
      id: String(m?.id ?? `m-${i + 1}`),
      label: String(m?.label ?? `Marker ${i + 1}`),
      x: Number(m?.x ?? 50),
      y: Number(m?.y ?? 50),
      targetBlockId: m?.target_block_id ? String(m.target_block_id) : null,
    }))
    .filter((m: MapMarker) => Number.isFinite(m.x) && Number.isFinite(m.y));
}

export function extractHexMarkers(meta: any): HexMarker[] {
  const list = Array.isArray(meta?.markers) ? meta.markers : [];
  return list
    .map((m: any, i: number) => {
      const rawRewards = Array.isArray(m?.reward_item_ids)
        ? m.reward_item_ids
        : typeof m?.reward_item_ids === "string"
          ? m.reward_item_ids.split(",")
          : [];
      const rewardItemIds = Array.from(
        new Set(rawRewards.map((v: any) => String(v ?? "").trim()).filter(Boolean))
      );
      const rawRequiredQuests = Array.isArray(m?.required_quest_ids)
        ? m.required_quest_ids
        : typeof m?.required_quest_ids === "string"
          ? m.required_quest_ids.split(",")
          : [];
      const requiredQuestIds = Array.from(
        new Set(rawRequiredQuests.map((v: any) => String(v ?? "").trim()).filter(Boolean))
      );
      const checkDcRaw = Number(m?.check_dc ?? NaN);
      const rollOutcomesRaw = Array.isArray(m?.roll_outcomes) ? m.roll_outcomes : [];
      const checkPromptsRaw = Array.isArray(m?.check_prompts) ? m.check_prompts : [];
      const checkPrompts = checkPromptsRaw
        .map((p: any, pi: number) => {
          const dcRaw = Number(p?.dc ?? NaN);
          return {
            id: String(p?.id ?? `check-${pi + 1}`),
            label: String(p?.label ?? "").trim() || null,
            checkKey: String(p?.check_key ?? "").trim(),
            dc: Number.isFinite(dcRaw) ? Math.max(0, Math.floor(dcRaw)) : null,
            storytellerScript: String(p?.storyteller_script ?? "").trim() || null,
            notes: String(p?.notes ?? "").trim() || null,
          };
        })
        .filter((p: any) => String(p.checkKey ?? "").trim().length > 0);
      const rollOutcomes = rollOutcomesRaw
        .map((o: any, oi: number) => {
          const minRaw = Number(o?.min_roll ?? NaN);
          const maxRaw = Number(o?.max_roll ?? NaN);
          const minRoll = Number.isFinite(minRaw) ? Math.max(0, Math.floor(minRaw)) : null;
          const maxRoll = Number.isFinite(maxRaw) ? Math.max(0, Math.floor(maxRaw)) : null;
          return {
            id: String(o?.id ?? `outcome-${oi + 1}`),
            minRoll,
            maxRoll,
            label: String(o?.label ?? `Outcome ${oi + 1}`),
            storytellerScript: String(o?.storyteller_script ?? "").trim(),
            notes: String(o?.notes ?? "").trim() || null,
          };
        })
        .filter((o: any) => String(o.storytellerScript ?? "").trim().length > 0 || String(o.label ?? "").trim().length > 0);
      return {
        id: String(m?.id ?? `m-${i + 1}`),
        label: String(m?.label ?? `Hex ${i + 1}`),
        x: Number(m?.x ?? 50),
        y: Number(m?.y ?? 50),
        targetBlockId: m?.target_block_id ? String(m.target_block_id) : null,
        focusImageUrl: String(m?.focus_image_url ?? "").trim() || null,
        checkKey: String(m?.check_key ?? "").trim() || null,
        checkDc: Number.isFinite(checkDcRaw) ? Math.max(0, Math.floor(checkDcRaw)) : null,
        rewardItemIds,
        requiredQuestIds,
        playerText: String(m?.player_text ?? "").trim() || null,
        storytellerNotes: String(m?.storyteller_notes ?? "").trim() || null,
        checkPrompts,
        rollOutcomes,
      } as HexMarker;
    })
    .filter((m: HexMarker) => Number.isFinite(m.x) && Number.isFinite(m.y));
}

export function buildRuntimeSequence(scenes: Array<{ scene: RuntimeBlock; children: RuntimeBlock[] }>) {
  return scenes.map((s, si) => ({
    id: s.scene.id,
    label: `S${si + 1}`,
    title: s.scene.title ?? `Scene ${si + 1}`,
    stepCount: s.children.filter(isPresentableBlock).length,
  }));
}
