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

export default function NpcTabsEditorClient(props: { initialMeta: any; fallbackInfo?: string | null }) {
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

  const extraMeta = useMemo(() => {
    const copy = { ...(props.initialMeta ?? {}) } as Record<string, any>;
    delete copy.npc_tabs;
    return copy;
  }, [props.initialMeta]);

  const metaJson = JSON.stringify({ ...extraMeta, npc_tabs: tabs }, null, 2);

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

