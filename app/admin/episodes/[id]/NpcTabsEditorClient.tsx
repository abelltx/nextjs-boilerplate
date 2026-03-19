"use client";

import { useMemo, useState } from "react";

type TabKey = "information" | "gear" | "quests" | "training";
const KEYS: TabKey[] = ["information", "gear", "quests", "training"];
const LABELS: Record<TabKey, string> = {
  information: "Information",
  gear: "Gear",
  quests: "Quests",
  training: "Training",
};

type QuestDraft = {
  uiKey: string;
  id: string;
  title: string;
  directions: string;
  storytellerNotes: string;
  storytellerControlled: boolean;
  taskLines: string;
  talkNpcIds: string;
  rewardItemIds: string;
  rewardFaith: number;
  prereqEnabled: boolean;
  prereqQuestId: string;
};

function makeUiKey(seed?: string) {
  const base = String(seed ?? "").trim();
  return base ? `q_${base}` : `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toQuestId(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function normalizeUuidList(text: unknown) {
  return Array.from(
    new Set(
      String(text ?? "")
        .split(/\r?\n|,/g)
        .map((s) => s.trim())
      .filter(Boolean)
    )
  );
}

function isUuid(value: unknown) {
  const v = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function extractTaskItemId(task: any): string | null {
  const direct = String(task?.target_item_id ?? task?.item_id ?? task?.required_item_id ?? "")
    .trim()
    .toLowerCase();
  if (isUuid(direct)) return direct;
  const title = String(task?.title ?? "").trim();
  const tagged = title.match(/\[item_id:([0-9a-f-]{36})\]/i);
  if (tagged?.[1] && isUuid(tagged[1])) return String(tagged[1]).trim().toLowerCase();
  const prefixed = title.match(/^(?:have_item|item)\s*:\s*([0-9a-f-]{36})/i);
  if (prefixed?.[1] && isUuid(prefixed[1])) return String(prefixed[1]).trim().toLowerCase();
  return null;
}

function cleanTaskTitle(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .replace(/\[item_id:[^\]]+\]/gi, "")
    .replace(/^(?:have_item|item)\s*:\s*[0-9a-f-]{36}\s*\|?\s*/i, "")
    .trim();
}

function toBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (!v) return fallback;
    if (["true", "1", "yes", "on"].includes(v)) return true;
    if (["false", "0", "no", "off", "null", "undefined"].includes(v)) return false;
  }
  return fallback;
}

function parseQuestDrafts(initialMeta: any): QuestDraft[] {
  try {
    const defs = initialMeta?.npc_tabs?.quests?.quest_defs;
    if (!Array.isArray(defs) || !defs.length) return [];
    return defs.map((raw: any, idx: number) => {
      const tasks = Array.isArray(raw?.tasks) ? raw.tasks : [];
      const plainTasks = tasks
        .filter((t: any) => String(t?.kind ?? "").trim().toLowerCase() !== "talk_to_npc")
        .map((t: any) => {
          const kind = String(t?.kind ?? "").trim().toLowerCase();
          const itemId = extractTaskItemId(t);
          const title = cleanTaskTitle(t?.title);
          if (["have_item", "item", "requires_item"].includes(kind) || itemId) {
            return itemId ? `have_item:${itemId} | ${title || "Deliver required item"}` : title;
          }
          return title;
        })
        .filter(Boolean);
      const npcTasks = tasks
        .filter((t: any) => String(t?.kind ?? "").trim().toLowerCase() === "talk_to_npc")
        .map((t: any) => String(t?.target_npc_block_id ?? "").trim())
        .filter(Boolean);

      const rewards = raw?.rewards ?? {};
      const rewardItems = Array.isArray(rewards?.item_ids) ? rewards.item_ids : [];
      const rewardFaith = Number(rewards?.faith ?? 0);

      return {
        uiKey: makeUiKey(`${raw?.id ?? ""}_${idx}`),
        id: String(raw?.id ?? "").trim() || `quest_${idx + 1}`,
        title: String(raw?.title ?? "").trim() || `Quest ${idx + 1}`,
        directions: String(raw?.directions ?? "").trim(),
        storytellerNotes: String(raw?.storyteller_notes ?? "").trim(),
        storytellerControlled: toBool(raw?.storyteller_controlled, false),
        taskLines: plainTasks.join("\n"),
        talkNpcIds: npcTasks.join("\n"),
        rewardItemIds: rewardItems.map((v: any) => String(v ?? "").trim()).filter(Boolean).join("\n"),
        rewardFaith: Number.isFinite(rewardFaith) ? Math.max(0, Math.floor(rewardFaith)) : 0,
        prereqEnabled: toBool(raw?.prerequisite?.enabled, false),
        prereqQuestId: String(raw?.prerequisite?.quest_id ?? "").trim(),
      } satisfies QuestDraft;
    });
  } catch {
    return [];
  }
}

export default function NpcTabsEditorClient(props: {
  initialMeta: any;
  fallbackInfo?: string | null;
  itemOptions?: Array<{ id: string; name: string; faith_required?: number | null; is_active?: boolean | null }>;
  traitOptions?: Array<{ id: string; name: string; is_active?: boolean | null }>;
  actionOptions?: Array<{ id: string; name: string; is_active?: boolean | null }>;
  npcOptions?: Array<{
    id: string;
    name: string;
    description?: string | null;
    medium_url?: string | null;
    designer_url?: string | null;
  }>;
  returnTo?: string;
  episodeScopeId?: string;
  libraryOnly?: boolean;
  showLibraryLink?: boolean;
  showAdvancedMeta?: boolean;
  episodeQuestOptions?: Array<{ questId: string; title: string; npcName?: string | null }>;
}) {
  const rawTabs = (props.initialMeta?.npc_tabs ?? {}) as Record<string, any>;
  const [tabs, setTabs] = useState<Record<TabKey, { enabled: boolean; content: string }>>({
    information: {
      enabled: rawTabs?.information?.enabled !== false,
      content: String(rawTabs?.information?.content ?? props.fallbackInfo ?? ""),
    },
    gear: {
      enabled: Boolean(rawTabs?.gear?.enabled),
      content: String(rawTabs?.gear?.content ?? ""),
    },
    quests: {
      enabled: Boolean(rawTabs?.quests?.enabled),
      content: String(rawTabs?.quests?.content ?? ""),
    },
    training: {
      enabled: Boolean(rawTabs?.training?.enabled),
      content: String(rawTabs?.training?.content ?? ""),
    },
  });
  const [gearText, setGearText] = useState<string>(() => {
    const ids = props.initialMeta?.npc_tabs?.gear?.item_ids;
    if (Array.isArray(ids)) {
      return ids.map((v: any) => String(v ?? "").trim()).filter(Boolean).join("\n");
    }
    const legacy = props.initialMeta?.npc_tabs?.gear?.items;
    if (Array.isArray(legacy)) {
      return legacy
        .map((x: any) => String(x?.item_id ?? x?.id ?? "").trim())
        .filter(Boolean)
        .join("\n");
    }
    return "";
  });
  const gearIds = useMemo(() => normalizeUuidList(gearText), [gearText]);
  const [trainingText, setTrainingText] = useState<string>(() => {
    const allIds = props.initialMeta?.npc_tabs?.training?.training_ids;
    const ids = props.initialMeta?.npc_tabs?.training?.trait_ids;
    const actionIds = props.initialMeta?.npc_tabs?.training?.action_ids;
    const merged = [
      ...(Array.isArray(allIds) ? allIds : []),
      ...(Array.isArray(ids) ? ids : []),
      ...(Array.isArray(actionIds) ? actionIds : []),
    ];
    if (merged.length) return merged.map((v: any) => String(v ?? "").trim()).filter(Boolean).join("\n");
    return "";
  });
  const [quests, setQuests] = useState<QuestDraft[]>(() => parseQuestDrafts(props.initialMeta));
  const [linkedNpcId, setLinkedNpcId] = useState<string>(() =>
    String(props.initialMeta?.npc_library?.npc_id ?? "").trim()
  );
  const showLibraryLink = props.showLibraryLink !== false;
  const showAdvancedMeta = props.showAdvancedMeta !== false;
  const safeItemOptions = useMemo(
    () =>
      (props.itemOptions ?? []).map((it: any) => ({
        id: String(it?.id ?? "").trim(),
        name: String(it?.name ?? "").trim() || "Unnamed item",
        faith_required: Number.isFinite(Number(it?.faith_required)) ? Number(it.faith_required) : 0,
        is_active: typeof it?.is_active === "boolean" ? it.is_active : null,
      })),
    [props.itemOptions]
  );
  const safeTraitOptions = useMemo(
    () =>
      (props.traitOptions ?? []).map((it: any) => ({
        id: String(it?.id ?? "").trim(),
        name: String(it?.name ?? "").trim() || "Unnamed trait",
        is_active: typeof it?.is_active === "boolean" ? it.is_active : null,
      })),
    [props.traitOptions]
  );
  const safeActionOptions = useMemo(
    () =>
      (props.actionOptions ?? []).map((it: any) => ({
        id: String(it?.id ?? "").trim(),
        name: String(it?.name ?? "").trim() || "Unnamed action",
        is_active: typeof it?.is_active === "boolean" ? it.is_active : null,
      })),
    [props.actionOptions]
  );
  const safeQuests = useMemo(
    () =>
      (Array.isArray(quests) ? quests : []).map((q, idx) => ({
        uiKey: String((q as any)?.uiKey ?? makeUiKey(`${idx + 1}`)),
        id: String((q as any)?.id ?? `quest_${idx + 1}`),
        title: String((q as any)?.title ?? `Quest ${idx + 1}`),
        directions: String((q as any)?.directions ?? ""),
        storytellerNotes: String((q as any)?.storytellerNotes ?? ""),
        storytellerControlled: Boolean((q as any)?.storytellerControlled),
        taskLines: String((q as any)?.taskLines ?? ""),
        talkNpcIds: String((q as any)?.talkNpcIds ?? ""),
        rewardItemIds: String((q as any)?.rewardItemIds ?? ""),
        rewardFaith: Math.max(0, Math.floor(Number((q as any)?.rewardFaith ?? 0) || 0)),
        prereqEnabled: Boolean((q as any)?.prereqEnabled),
        prereqQuestId: String((q as any)?.prereqQuestId ?? ""),
      })),
    [quests]
  );
  const episodePrereqOptions = useMemo(
    () =>
      (props.episodeQuestOptions ?? [])
        .map((q: any) => ({
          questId: String(q?.questId ?? "").trim(),
          title: String(q?.title ?? "").trim(),
          npcName: String(q?.npcName ?? "").trim() || null,
        }))
        .filter((q) => q.questId.length > 0),
    [props.episodeQuestOptions]
  );
  const trainingIds = useMemo(() => normalizeUuidList(trainingText), [trainingText]);
  const optionMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; faith_required?: number | null }>();
    for (const it of safeItemOptions) map.set(String(it.id), it);
    return map;
  }, [safeItemOptions]);
  const itemSnapshots = useMemo(
    () =>
      gearIds
        .map((id) => {
          const found = optionMap.get(id);
          if (!found) return null;
          return {
            id: found.id,
            name: found.name,
            faith_required: Math.max(0, Number(found.faith_required ?? 0)),
          };
        })
        .filter(Boolean),
    [gearIds, optionMap]
  );
  const traitMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const it of safeTraitOptions) map.set(String(it.id), it);
    return map;
  }, [safeTraitOptions]);
  const trainingSnapshots = useMemo(
    () =>
      trainingIds
        .map((id) => {
          const found = traitMap.get(id);
          if (!found) return null;
          return { id: found.id, name: found.name, source: "trait" as const };
        })
        .filter(Boolean),
    [trainingIds, traitMap]
  );
  const actionMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const it of safeActionOptions) map.set(String(it.id), it);
    return map;
  }, [safeActionOptions]);
  const actionTrainingSnapshots = useMemo(
    () =>
      trainingIds
        .map((id) => {
          const found = actionMap.get(id);
          if (!found) return null;
          return { id: found.id, name: found.name, source: "action" as const };
        })
        .filter(Boolean),
    [trainingIds, actionMap]
  );
  const unknownTrainingSnapshots = useMemo(
    () =>
      trainingIds
        .filter((id) => !traitMap.has(id) && !actionMap.has(id))
        .map((id) => ({ id, name: id, source: "unknown" as const })),
    [trainingIds, traitMap, actionMap]
  );
  const combinedTrainingOptions = useMemo(
    () => [
      ...safeTraitOptions.map((it) => ({
        id: it.id,
        name: it.name,
        is_active: it.is_active,
        source: "trait" as const,
      })),
      ...safeActionOptions.map((it) => ({
        id: it.id,
        name: it.name,
        is_active: it.is_active,
        source: "action" as const,
      })),
    ],
    [safeTraitOptions, safeActionOptions]
  );
  const itemLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of safeItemOptions) m.set(String(it.id), String(it.name ?? "").trim() || String(it.id));
    return m;
  }, [safeItemOptions]);
  const npcMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string; description?: string | null; medium_url?: string | null; designer_url?: string | null }>();
    for (const n of props.npcOptions ?? []) {
      const id = String(n?.id ?? "").trim();
      if (!id) continue;
      m.set(id, {
        id,
        name: String(n?.name ?? "").trim() || id,
        description: n?.description ?? null,
        medium_url: n?.medium_url ?? null,
        designer_url: n?.designer_url ?? null,
      });
    }
    return m;
  }, [props.npcOptions]);
  const linkedNpc = linkedNpcId ? npcMap.get(linkedNpcId) ?? null : null;
  const questDefs = useMemo(
    () =>
      safeQuests
        .map((q, idx) => {
          const id = toQuestId(q.id) || toQuestId(q.title) || `quest_${idx + 1}`;
          const title = q.title.trim() || `Quest ${idx + 1}`;
          const directions = q.directions.trim();
          const storytellerNotes = q.storytellerNotes.trim();
          const storytellerControlled = Boolean(q.storytellerControlled);
          const taskLines = q.taskLines
            .split(/\r?\n/g)
            .map((v) => v.trim())
            .filter(Boolean);
          const npcIds = normalizeUuidList(q.talkNpcIds).filter((id) => isUuid(id));
          const rewardItemIds = normalizeUuidList(q.rewardItemIds);
          const rewardFaith = Math.max(0, Math.floor(Number(q.rewardFaith ?? 0) || 0));
          const prerequisiteEnabled = Boolean(q.prereqEnabled && String(q.prereqQuestId ?? "").trim());
          const prerequisiteQuestId = prerequisiteEnabled
            ? String(q.prereqQuestId ?? "").trim()
            : "";
          const tasks = [
            ...taskLines.map((line, taskIdx) => {
              const itemMatch = line.match(/^(?:have_item|item)\s*:\s*([0-9a-f-]{36})(?:\s*\|\s*(.+))?$/i);
              if (itemMatch?.[1]) {
                const itemId = String(itemMatch[1]).trim().toLowerCase();
                const label = String(itemMatch[2] ?? "").trim();
                return {
                  id: `${id}_task_${taskIdx + 1}`,
                  kind: "have_item",
                  title: label || `Have required item [item_id:${itemId}]`,
                  target_item_id: itemId,
                };
              }
              return {
                id: `${id}_task_${taskIdx + 1}`,
                kind: "task",
                title: line,
              };
            }),
            ...npcIds.map((npcId, npcIdx) => {
              const npcName = npcMap.get(npcId)?.name?.trim() || "";
              return {
                id: `${id}_talk_${npcIdx + 1}`,
                kind: "talk_to_npc",
                title: npcName ? `Talk to ${npcName}` : `Talk to NPC (${npcId.slice(0, 8)}...)`,
                target_npc_block_id: npcId,
                target_npc_name: npcName || null,
              };
            }),
          ];
          return {
            id,
            title,
            directions,
            storyteller_notes: storytellerNotes,
            storyteller_controlled: storytellerControlled,
            prerequisite: {
              enabled: prerequisiteEnabled,
              quest_id: prerequisiteQuestId || null,
            },
            tasks,
            rewards: {
              faith: rewardFaith,
              item_ids: rewardItemIds,
              item_snapshots: rewardItemIds.map((itemId) => ({
                id: itemId,
                name: itemLabelById.get(itemId) ?? itemId,
              })),
            },
          };
        })
        .filter((q) => q.title.length > 0),
    [safeQuests, itemLabelById, npcMap]
  );

  const extraMeta = useMemo(() => {
    const copy = { ...(props.initialMeta ?? {}) } as Record<string, any>;
    delete copy.npc_tabs;
    return copy;
  }, [props.initialMeta]);

  const metaJson = useMemo(() => {
    try {
      const npcTabsPayload = props.libraryOnly
        ? null
        : {
            ...tabs,
            gear: {
              ...tabs.gear,
              item_ids: gearIds,
              item_snapshots: itemSnapshots,
            },
            training: {
              ...tabs.training,
              training_ids: trainingIds,
              trait_ids: trainingIds.filter((id) => traitMap.has(id)),
              action_ids: trainingIds.filter((id) => actionMap.has(id)),
              trait_snapshots: trainingSnapshots,
              action_snapshots: actionTrainingSnapshots,
              unknown_snapshots: unknownTrainingSnapshots,
            },
            quests: {
              ...tabs.quests,
              quest_defs: questDefs,
            },
          };
      const libraryPayload = showLibraryLink
        ? {
            npc_binding: linkedNpc
              ? {
                  binding_id: String(props.initialMeta?.npc_binding?.binding_id ?? "").trim() || null,
                  npc_id: linkedNpc.id,
                }
              : null,
            npc_library: linkedNpc
              ? {
                  npc_id: linkedNpc.id,
                  name: linkedNpc.name,
                  description: linkedNpc.description ?? null,
                  image_url: linkedNpc.medium_url ?? null,
                  designer_url: linkedNpc.designer_url ?? null,
                }
              : null,
          }
        : {};
      return JSON.stringify(
        {
          ...extraMeta,
          ...(npcTabsPayload ? { npc_tabs: npcTabsPayload } : {}),
          ...libraryPayload,
        },
        null,
        2
      );
    } catch {
      return "{}";
    }
  }, [
    actionMap,
    actionTrainingSnapshots,
    extraMeta,
    gearIds,
    itemSnapshots,
    linkedNpc,
    questDefs,
    showLibraryLink,
    tabs,
    traitMap,
    trainingIds,
    trainingSnapshots,
    unknownTrainingSnapshots,
    props.initialMeta,
    props.libraryOnly,
  ]);

  return (
    <div className="space-y-2 rounded-lg border p-2">
      <div className="text-xs uppercase text-gray-500">
        {props.libraryOnly ? "NPC Library Link" : "NPC Tabs"}
      </div>
      <div className="text-xs text-gray-600">
        {props.libraryOnly
          ? "Link this scene NPC to a library NPC. Configure quests/gear/training in NPC Designer."
          : "Enable only the tabs you need for this NPC."}
      </div>

      <div className="space-y-2">
        {showLibraryLink ? (
        <div className="rounded border p-2 space-y-2">
          <div className="text-sm font-semibold">NPC Library Link</div>
          <div className="text-xs text-gray-600">
            Link this scene NPC to a Designer NPC so image/description stay reusable across episodes.
          </div>
          <select
            className="w-full border rounded p-2 text-sm"
            value={linkedNpcId}
            onChange={(e) => setLinkedNpcId(String(e.currentTarget.value ?? "").trim())}
          >
            <option value="">No linked library NPC</option>
            {(props.npcOptions ?? []).map((npc) => (
              <option key={npc.id} value={npc.id}>
                {npc.name} ({npc.id})
              </option>
            ))}
          </select>
          {linkedNpc ? (
            <div className="rounded border bg-gray-50 px-2 py-2 text-xs text-gray-700">
              <div className="font-semibold">{linkedNpc.name}</div>
              <div className="mt-1 font-mono">{linkedNpc.id}</div>
              {linkedNpc.designer_url ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(() => {
                    const hasQuery = linkedNpc.designer_url.includes("?");
                    const withReturn = props.returnTo
                      ? `${linkedNpc.designer_url}${hasQuery ? "&" : "?"}return_to=${encodeURIComponent(props.returnTo)}`
                      : linkedNpc.designer_url;
                    const withScope =
                      props.episodeScopeId && /^[0-9a-f-]{36}$/i.test(props.episodeScopeId)
                        ? `${withReturn}${withReturn.includes("?") ? "&" : "?"}episode_scope=${encodeURIComponent(props.episodeScopeId)}`
                        : withReturn;
                    return (
                  <a
                    href={withScope}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border bg-white px-2 py-1 text-xs hover:bg-gray-100"
                  >
                    Open in NPC Designer
                  </a>
                    );
                  })()}
                  {props.returnTo ? (
                    <a href={props.returnTo} className="rounded border bg-white px-2 py-1 text-xs hover:bg-gray-100">
                      Return to Episode
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        ) : null}
        {props.libraryOnly ? null : KEYS.map((k) => (
          <div key={k} className="rounded border p-2">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={tabs[k].enabled}
                onChange={(e) => setTabs((prev) => ({ ...prev, [k]: { ...prev[k], enabled: e.target.checked } }))}
              />
              {LABELS[k]}
            </label>
            <textarea
              className="mt-2 w-full border rounded p-2 h-20 text-sm"
              placeholder={`${LABELS[k]} details`}
              value={tabs[k].content}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setTabs((prev) => ({ ...prev, [k]: { ...prev[k], content: value } }));
              }}
            />
            {k === "quests" ? (
              <div className="mt-2 space-y-2 rounded border border-dashed p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-gray-700">Quest Builder</div>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() =>
                      setQuests((prev) => [
                        ...prev,
                        {
                          uiKey: makeUiKey(`${prev.length + 1}`),
                          id: `quest_${prev.length + 1}`,
                          title: `Quest ${prev.length + 1}`,
                          directions: "",
                          storytellerNotes: "",
                          storytellerControlled: true,
                          taskLines: "",
                          talkNpcIds: "",
                          rewardItemIds: "",
                          rewardFaith: 0,
                          prereqEnabled: false,
                          prereqQuestId: "",
                        },
                      ])
                    }
                  >
                    Add Quest
                  </button>
                </div>
                <div className="text-[11px] text-gray-600">
                  Quests can include manual task lines, talk-to-NPC tasks, and rewards (items + faith).
                </div>
                {safeQuests.length === 0 ? (
                  <div className="text-xs text-gray-500">No quests yet. Click Add Quest.</div>
                ) : null}
                {safeQuests.map((q, idx) => {
                  const rewardItemIds = normalizeUuidList(q.rewardItemIds);
                  const localPrereqOptions = safeQuests
                    .filter((_, qIdx) => qIdx !== idx)
                    .map((other, qIdx) => {
                      const otherId = toQuestId(other.id) || toQuestId(other.title) || `quest_${qIdx + 1}`;
                      return {
                        questId: otherId,
                        title: other.title || otherId,
                        npcName: null as string | null,
                      };
                    });
                  const mergedPrereqOptions = Array.from(
                    new Map(
                      [...localPrereqOptions, ...episodePrereqOptions]
                        .filter((opt) => opt.questId !== (toQuestId(q.id) || toQuestId(q.title) || `quest_${idx + 1}`))
                        .map((opt) => [opt.questId, opt] as const)
                    ).values()
                  );
                  return (
                    <div key={q.uiKey} className="rounded border bg-white p-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-gray-700">Quest {idx + 1}</div>
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs text-red-700"
                          onClick={() => setQuests((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <label className="space-y-1">
                          <div className="text-[11px] text-gray-600">Quest ID</div>
                          <input
                            className="w-full border rounded p-2 text-xs font-mono"
                            value={q.id}
                            onChange={(e) => {
                              const value = e.currentTarget.value;
                              setQuests((prev) =>
                                prev.map((row, i) => (i === idx ? { ...row, id: value } : row))
                              );
                            }}
                            placeholder="welcome_olives"
                          />
                        </label>
                        <label className="space-y-1">
                          <div className="text-[11px] text-gray-600">Quest Title</div>
                          <input
                            className="w-full border rounded p-2 text-sm"
                            value={q.title}
                            onChange={(e) => {
                              const value = e.currentTarget.value;
                              setQuests((prev) =>
                                prev.map((row, i) => (i === idx ? { ...row, title: value } : row))
                              );
                            }}
                            placeholder="Gather Church Supplies"
                          />
                        </label>
                      </div>

                      <label className="space-y-1 block">
                        <div className="text-[11px] text-gray-600">Directions (shown to player)</div>
                        <textarea
                          className="w-full border rounded p-2 text-sm h-16"
                          value={q.directions}
                          onChange={(e) => {
                            const value = e.currentTarget.value;
                            setQuests((prev) =>
                              prev.map((row, i) => (i === idx ? { ...row, directions: value } : row))
                            );
                          }}
                          placeholder="Speak with Gabriel, then check in with the supply table."
                        />
                      </label>
                      <label className="space-y-1 block">
                        <div className="text-[11px] text-gray-600">Storyteller Notes (ST only)</div>
                        <textarea
                          className="w-full border rounded p-2 text-sm h-20"
                          value={q.storytellerNotes}
                          onChange={(e) => {
                            const value = e.currentTarget.value;
                            setQuests((prev) =>
                              prev.map((row, i) => (i === idx ? { ...row, storytellerNotes: value } : row))
                            );
                          }}
                          placeholder="Read this paragraph to players while this quest is active."
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={Boolean(q.storytellerControlled)}
                          onChange={(e) => {
                            const checked = e.currentTarget.checked;
                            setQuests((prev) =>
                              prev.map((row, i) => (i === idx ? { ...row, storytellerControlled: checked } : row))
                            );
                          }}
                        />
                        Storyteller controls start/progress for this quest
                      </label>
                      <div className="rounded border bg-gray-50 p-2 space-y-2">
                        <label className="flex items-center gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            checked={Boolean(q.prereqEnabled)}
                            onChange={(e) => {
                              const checked = e.currentTarget.checked;
                              setQuests((prev) =>
                                prev.map((row, i) =>
                                  i === idx
                                    ? { ...row, prereqEnabled: checked, prereqQuestId: checked ? row.prereqQuestId : "" }
                                    : row
                                )
                              );
                            }}
                          />
                          Require previous quest completion
                        </label>
                        {q.prereqEnabled ? (
                          <select
                            className="w-full border rounded p-2 text-sm"
                            value={q.prereqQuestId}
                            onChange={(e) => {
                              const value = String(e.currentTarget.value ?? "");
                              setQuests((prev) =>
                                prev.map((row, i) => (i === idx ? { ...row, prereqQuestId: value } : row))
                              );
                            }}
                          >
                            <option value="">Select prerequisite quest...</option>
                            {mergedPrereqOptions.map((opt, prIdx) => (
                              <option key={`${opt.questId}-${prIdx}`} value={opt.questId}>
                                {opt.npcName ? `${opt.npcName} - ` : ""}
                                {opt.title || opt.questId} ({opt.questId})
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <label className="space-y-1">
                          <div className="text-[11px] text-gray-600">Task Steps (one per line)</div>
                          <textarea
                            className="w-full border rounded p-2 text-xs h-20"
                            value={q.taskLines}
                            onChange={(e) => {
                              const value = e.currentTarget.value;
                              setQuests((prev) =>
                                prev.map((row, i) => (i === idx ? { ...row, taskLines: value } : row))
                              );
                            }}
                            placeholder={"Find Gabriel\nAsk about class mentors\nReturn to the front table"}
                          />
                        </label>
                        <label className="space-y-1">
                          <div className="text-[11px] text-gray-600">Talk To NPC Block IDs (UUID, one per line)</div>
                          <textarea
                            className="w-full border rounded p-2 text-xs h-20 font-mono"
                            value={q.talkNpcIds}
                            onChange={(e) => {
                              const value = e.currentTarget.value;
                              setQuests((prev) =>
                                prev.map((row, i) => (i === idx ? { ...row, talkNpcIds: value } : row))
                              );
                            }}
                            placeholder={"e0f49433-8461-4a74-85d8-efd3cd422cea"}
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <label className="space-y-1">
                          <div className="text-[11px] text-gray-600">Reward Item IDs (UUID, one per line)</div>
                          <textarea
                            className="w-full border rounded p-2 text-xs h-20 font-mono"
                            value={q.rewardItemIds}
                            onChange={(e) => {
                              const value = e.currentTarget.value;
                              setQuests((prev) =>
                                prev.map((row, i) => (i === idx ? { ...row, rewardItemIds: value } : row))
                              );
                            }}
                            placeholder={"e0f49433-8461-4a74-85d8-efd3cd422cea"}
                          />
                          {safeItemOptions.length ? (
                            <select
                              className="w-full border rounded p-2 text-sm"
                              defaultValue=""
                              onChange={(e) => {
                                const next = e.target.value;
                                if (!next) return;
                                setQuests((prev) =>
                                  prev.map((row, i) => {
                                    if (i !== idx) return row;
                                    const merged = Array.from(
                                      new Set([...normalizeUuidList(row.rewardItemIds), next])
                                    );
                                    return { ...row, rewardItemIds: merged.join("\n") };
                                  })
                                );
                                e.currentTarget.value = "";
                              }}
                            >
                              <option value="">Quick add reward item...</option>
                              {safeItemOptions.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.name} ({it.id})
                                </option>
                              ))}
                            </select>
                          ) : null}
                          {rewardItemIds.length ? (
                            <div className="space-y-1">
                              {rewardItemIds.map((id) => (
                                <div key={id} className="rounded border px-2 py-1 text-[11px]">
                                  <span className="font-mono">{id}</span>
                                  <span className="ml-2 text-gray-600">{itemLabelById.get(id) ?? "Unknown item"}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </label>

                        <label className="space-y-1">
                          <div className="text-[11px] text-gray-600">Reward Faith Points</div>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className="w-full border rounded p-2 text-sm"
                            value={String(q.rewardFaith)}
                            onChange={(e) => {
                              const value = e.currentTarget.value;
                              setQuests((prev) =>
                                prev.map((row, i) =>
                                  i === idx
                                    ? {
                                        ...row,
                                        rewardFaith: Math.max(0, Math.floor(Number(value || 0))),
                                      }
                                    : row
                                )
                              );
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {k === "gear" ? (
              <div className="mt-2 space-y-2 rounded border border-dashed p-2">
                <div className="text-xs font-semibold text-gray-600">
                  Gear Item IDs (UUID, one per line)
                </div>
                <textarea
                  className="w-full border rounded p-2 h-28 font-mono text-xs"
                  placeholder={"e0f49433-8461-4a74-85d8-efd3cd422cea\n..."}
                  value={gearText}
                  onChange={(e) => setGearText(e.target.value)}
                />
                {safeItemOptions.length ? (
                  <div className="space-y-1">
                    <div className="text-[11px] text-gray-600">Quick add from Item Library:</div>
                    <select
                      className="w-full border rounded p-2 text-sm"
                      defaultValue=""
                      onChange={(e) => {
                        const next = e.target.value;
                        if (!next) return;
                        setGearText((prev) => {
                          const merged = Array.from(new Set([...normalizeUuidList(prev), next]));
                          return merged.join("\n");
                        });
                        e.currentTarget.value = "";
                      }}
                    >
                      <option value="">Select an item...</option>
                      {safeItemOptions.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name} ({it.id}){typeof it.faith_required === "number" ? ` - faith ${it.faith_required}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {gearIds.length ? (
                  <div className="space-y-1">
                    {gearIds.map((id) => {
                      const found = optionMap.get(id);
                      return (
                        <div key={id} className="rounded border px-2 py-1 text-xs">
                          <span className="font-mono">{id}</span>
                          {found ? (
                            <span className="ml-2 text-gray-600">
                              {found.name}
                              {typeof found.faith_required === "number" ? ` - faith ${found.faith_required}` : ""}
                            </span>
                          ) : (
                            <span className="ml-2 text-amber-700">Not found in current item library</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
            {k === "training" ? (
              <div className="mt-2 space-y-2 rounded border border-dashed p-2">
                <div className="text-xs font-semibold text-gray-600">
                  Training IDs (UUID, one per line)
                </div>
                <textarea
                  className="w-full border rounded p-2 h-28 font-mono text-xs"
                  placeholder={"11111111-2222-3333-4444-555555555555\n..."}
                  value={trainingText}
                  onChange={(e) => setTrainingText(e.target.value)}
                />
                <div className="space-y-1">
                  <div className="text-[11px] text-gray-600">Quick add from Traits + Actions Library:</div>
                  <select
                    className="w-full border rounded p-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                    defaultValue=""
                    disabled={combinedTrainingOptions.length === 0}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (!next) return;
                      setTrainingText((prev) => {
                        const merged = Array.from(new Set([...normalizeUuidList(prev), next]));
                        return merged.join("\n");
                      });
                      e.currentTarget.value = "";
                    }}
                  >
                    <option value="">
                      {combinedTrainingOptions.length ? "Select a trait or action..." : "No active traits/actions found"}
                    </option>
                    {combinedTrainingOptions.map((it) => (
                      <option key={`${it.source}-${it.id}`} value={it.id}>
                        [{it.source === "trait" ? "Trait" : "Action"}] {it.name}
                        {it.is_active === false ? " (inactive)" : ""}
                        {" "}({it.id})
                      </option>
                    ))}
                  </select>
                  {combinedTrainingOptions.length === 0 ? (
                    <div className="text-[11px] text-amber-700">
                      Create or activate traits/actions in <span className="font-mono">/admin/traits</span> and <span className="font-mono">/admin/actions</span>.
                    </div>
                  ) : null}
                </div>
                {trainingIds.length ? (
                  <div className="space-y-1">
                    {trainingIds.map((id) => {
                      const found = traitMap.get(id);
                      const foundAction = actionMap.get(id);
                      return (
                        <div key={id} className="rounded border px-2 py-1 text-xs">
                          <span className="font-mono">{id}</span>
                          {found ? (
                            <span className="ml-2 text-gray-600">[Trait] {found.name}</span>
                          ) : foundAction ? (
                            <span className="ml-2 text-gray-600">[Action] {foundAction.name}</span>
                          ) : (
                            <span className="ml-2 text-amber-700">Not found in current traits/actions libraries</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <input type="hidden" name="meta_json" value={metaJson} />
      {showAdvancedMeta ? (
      <details>
        <summary className="cursor-pointer text-xs text-gray-600">Advanced: raw meta JSON</summary>
        <pre className="mt-1 max-h-40 overflow-auto rounded border bg-gray-50 p-2 text-[11px]">{metaJson}</pre>
      </details>
      ) : null}
    </div>
  );
}
