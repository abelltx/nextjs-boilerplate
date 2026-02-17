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

export default function NpcTabsEditorClient(props: {
  initialMeta: any;
  fallbackInfo?: string | null;
  itemOptions?: Array<{ id: string; name: string; faith_required?: number | null }>;
  traitOptions?: Array<{ id: string; name: string }>;
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
    const ids = props.initialMeta?.npc_tabs?.training?.trait_ids;
    if (Array.isArray(ids)) return ids.map((v: any) => String(v ?? "").trim()).filter(Boolean).join("\n");
    return "";
  });
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
          return { id: found.id, name: found.name };
        })
        .filter(Boolean),
    [trainingIds, traitMap]
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
          trait_ids: trainingIds,
          trait_snapshots: trainingSnapshots,
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
                  Training Trait IDs (UUID, one per line)
                </div>
                <textarea
                  className="w-full border rounded p-2 h-28 font-mono text-xs"
                  placeholder={"11111111-2222-3333-4444-555555555555\n..."}
                  value={trainingText}
                  onChange={(e) => setTrainingText(e.target.value)}
                />
                <div className="space-y-1">
                  <div className="text-[11px] text-gray-600">Quick add from Traits Library:</div>
                  <select
                    className="w-full border rounded p-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                    defaultValue=""
                    disabled={(props.traitOptions ?? []).length === 0}
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
                      {(props.traitOptions ?? []).length ? "Select a training trait..." : "No active training traits found"}
                    </option>
                    {(props.traitOptions ?? []).map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name} ({it.id})
                      </option>
                    ))}
                  </select>
                  {(props.traitOptions ?? []).length === 0 ? (
                    <div className="text-[11px] text-amber-700">
                      Create or activate a training trait in <span className="font-mono">/admin/traits</span>.
                    </div>
                  ) : null}
                </div>
                {trainingIds.length ? (
                  <div className="space-y-1">
                    {trainingIds.map((id) => {
                      const found = traitMap.get(id);
                      return (
                        <div key={id} className="rounded border px-2 py-1 text-xs">
                          <span className="font-mono">{id}</span>
                          {found ? (
                            <span className="ml-2 text-gray-600">{found.name}</span>
                          ) : (
                            <span className="ml-2 text-amber-700">Not found in current traits library</span>
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
