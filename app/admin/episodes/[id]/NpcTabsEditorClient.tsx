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
  id: string;
  title: string;
  directions: string;
  taskLines: string;
  talkNpcIds: string;
  rewardItemIds: string;
  rewardFaith: number;
};

function toQuestId(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function normalizeUuidList(text: string) {
  return Array.from(
    new Set(
      text
        .split(/\r?\n|,/g)
        .map((s) => s.trim())
      .filter(Boolean)
    )
  );
}

function parseQuestDrafts(initialMeta: any): QuestDraft[] {
  const defs = initialMeta?.npc_tabs?.quests?.quest_defs;
  if (!Array.isArray(defs) || !defs.length) return [];
  return defs.map((raw: any, idx: number) => {
    const tasks = Array.isArray(raw?.tasks) ? raw.tasks : [];
    const plainTasks = tasks
      .filter((t: any) => String(t?.kind ?? "").trim().toLowerCase() !== "talk_to_npc")
      .map((t: any) => String(t?.title ?? "").trim())
      .filter(Boolean);
    const npcTasks = tasks
      .filter((t: any) => String(t?.kind ?? "").trim().toLowerCase() === "talk_to_npc")
      .map((t: any) => String(t?.target_npc_block_id ?? "").trim())
      .filter(Boolean);

    const rewards = raw?.rewards ?? {};
    const rewardItems = Array.isArray(rewards?.item_ids) ? rewards.item_ids : [];
    const rewardFaith = Number(rewards?.faith ?? 0);

    return {
      id: String(raw?.id ?? "").trim() || `quest_${idx + 1}`,
      title: String(raw?.title ?? "").trim() || `Quest ${idx + 1}`,
      directions: String(raw?.directions ?? "").trim(),
      taskLines: plainTasks.join("\n"),
      talkNpcIds: npcTasks.join("\n"),
      rewardItemIds: rewardItems.map((v: any) => String(v ?? "").trim()).filter(Boolean).join("\n"),
      rewardFaith: Number.isFinite(rewardFaith) ? Math.max(0, Math.floor(rewardFaith)) : 0,
    } satisfies QuestDraft;
  });
}

export default function NpcTabsEditorClient(props: {
  initialMeta: any;
  fallbackInfo?: string | null;
  itemOptions?: Array<{ id: string; name: string; faith_required?: number | null; is_active?: boolean | null }>;
  traitOptions?: Array<{ id: string; name: string; is_active?: boolean | null }>;
  actionOptions?: Array<{ id: string; name: string; is_active?: boolean | null }>;
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
  const trainingIds = useMemo(() => normalizeUuidList(trainingText), [trainingText]);
  const optionMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; faith_required?: number | null }>();
    for (const it of props.itemOptions ?? []) map.set(String(it.id), it);
    return map;
  }, [props.itemOptions]);
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
    for (const it of props.traitOptions ?? []) map.set(String(it.id), it);
    return map;
  }, [props.traitOptions]);
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
    for (const it of props.actionOptions ?? []) map.set(String(it.id), it);
    return map;
  }, [props.actionOptions]);
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
      ...(props.traitOptions ?? []).map((it) => ({
        id: it.id,
        name: it.name,
        is_active: it.is_active,
        source: "trait" as const,
      })),
      ...(props.actionOptions ?? []).map((it) => ({
        id: it.id,
        name: it.name,
        is_active: it.is_active,
        source: "action" as const,
      })),
    ],
    [props.traitOptions, props.actionOptions]
  );
  const itemLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of props.itemOptions ?? []) m.set(String(it.id), String(it.name ?? "").trim() || String(it.id));
    return m;
  }, [props.itemOptions]);
  const questDefs = useMemo(
    () =>
      quests
        .map((q, idx) => {
          const id = toQuestId(q.id) || toQuestId(q.title) || `quest_${idx + 1}`;
          const title = q.title.trim() || `Quest ${idx + 1}`;
          const directions = q.directions.trim();
          const taskLines = q.taskLines
            .split(/\r?\n/g)
            .map((v) => v.trim())
            .filter(Boolean);
          const npcIds = normalizeUuidList(q.talkNpcIds);
          const rewardItemIds = normalizeUuidList(q.rewardItemIds);
          const rewardFaith = Math.max(0, Math.floor(Number(q.rewardFaith ?? 0) || 0));
          const tasks = [
            ...taskLines.map((line, taskIdx) => ({
              id: `${id}_task_${taskIdx + 1}`,
              kind: "task",
              title: line,
            })),
            ...npcIds.map((npcId, npcIdx) => ({
              id: `${id}_talk_${npcIdx + 1}`,
              kind: "talk_to_npc",
              title: `Talk to NPC (${npcId.slice(0, 8)}...)`,
              target_npc_block_id: npcId,
            })),
          ];
          return {
            id,
            title,
            directions,
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
    [quests, itemLabelById]
  );

  const extraMeta = useMemo(() => {
    const copy = { ...(props.initialMeta ?? {}) } as Record<string, any>;
    delete copy.npc_tabs;
    return copy;
  }, [props.initialMeta]);

  const metaJson = JSON.stringify(
    {
      ...extraMeta,
      npc_tabs: {
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
      },
    },
    null,
    2
  );

  return (
    <div className="space-y-2 rounded-lg border p-2">
      <div className="text-xs uppercase text-gray-500">NPC Tabs</div>
      <div className="text-xs text-gray-600">Enable only the tabs you need for this NPC.</div>

      <div className="space-y-2">
        {KEYS.map((k) => (
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
              onChange={(e) => setTabs((prev) => ({ ...prev, [k]: { ...prev[k], content: e.target.value } }))}
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
                          id: `quest_${prev.length + 1}`,
                          title: `Quest ${prev.length + 1}`,
                          directions: "",
                          taskLines: "",
                          talkNpcIds: "",
                          rewardItemIds: "",
                          rewardFaith: 0,
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
                {quests.length === 0 ? (
                  <div className="text-xs text-gray-500">No quests yet. Click Add Quest.</div>
                ) : null}
                {quests.map((q, idx) => {
                  const rewardItemIds = normalizeUuidList(q.rewardItemIds);
                  return (
                    <div key={`${q.id}-${idx}`} className="rounded border bg-white p-2 space-y-2">
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
                            onChange={(e) =>
                              setQuests((prev) =>
                                prev.map((row, i) => (i === idx ? { ...row, id: e.currentTarget.value } : row))
                              )
                            }
                            placeholder="welcome_olives"
                          />
                        </label>
                        <label className="space-y-1">
                          <div className="text-[11px] text-gray-600">Quest Title</div>
                          <input
                            className="w-full border rounded p-2 text-sm"
                            value={q.title}
                            onChange={(e) =>
                              setQuests((prev) =>
                                prev.map((row, i) => (i === idx ? { ...row, title: e.currentTarget.value } : row))
                              )
                            }
                            placeholder="Gather Church Supplies"
                          />
                        </label>
                      </div>

                      <label className="space-y-1 block">
                        <div className="text-[11px] text-gray-600">Directions (shown to player)</div>
                        <textarea
                          className="w-full border rounded p-2 text-sm h-16"
                          value={q.directions}
                          onChange={(e) =>
                            setQuests((prev) =>
                              prev.map((row, i) => (i === idx ? { ...row, directions: e.currentTarget.value } : row))
                            )
                          }
                          placeholder="Speak with Gabriel, then check in with the supply table."
                        />
                      </label>

                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <label className="space-y-1">
                          <div className="text-[11px] text-gray-600">Task Steps (one per line)</div>
                          <textarea
                            className="w-full border rounded p-2 text-xs h-20"
                            value={q.taskLines}
                            onChange={(e) =>
                              setQuests((prev) =>
                                prev.map((row, i) => (i === idx ? { ...row, taskLines: e.currentTarget.value } : row))
                              )
                            }
                            placeholder={"Find Gabriel\nAsk about class mentors\nReturn to the front table"}
                          />
                        </label>
                        <label className="space-y-1">
                          <div className="text-[11px] text-gray-600">Talk To NPC Block IDs (UUID, one per line)</div>
                          <textarea
                            className="w-full border rounded p-2 text-xs h-20 font-mono"
                            value={q.talkNpcIds}
                            onChange={(e) =>
                              setQuests((prev) =>
                                prev.map((row, i) => (i === idx ? { ...row, talkNpcIds: e.currentTarget.value } : row))
                              )
                            }
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
                            onChange={(e) =>
                              setQuests((prev) =>
                                prev.map((row, i) => (i === idx ? { ...row, rewardItemIds: e.currentTarget.value } : row))
                              )
                            }
                            placeholder={"e0f49433-8461-4a74-85d8-efd3cd422cea"}
                          />
                          {(props.itemOptions ?? []).length ? (
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
                              {(props.itemOptions ?? []).map((it) => (
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
                            onChange={(e) =>
                              setQuests((prev) =>
                                prev.map((row, i) =>
                                  i === idx
                                    ? {
                                        ...row,
                                        rewardFaith: Math.max(0, Math.floor(Number(e.currentTarget.value || 0))),
                                      }
                                    : row
                                )
                              )
                            }
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
                {(props.itemOptions ?? []).length ? (
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
                      {(props.itemOptions ?? []).map((it) => (
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
      <details>
        <summary className="cursor-pointer text-xs text-gray-600">Advanced: raw meta JSON</summary>
        <pre className="mt-1 max-h-40 overflow-auto rounded border bg-gray-50 p-2 text-[11px]">{metaJson}</pre>
      </details>
    </div>
  );
}
