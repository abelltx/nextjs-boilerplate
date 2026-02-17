"use client";

import { useMemo, useState } from "react";

type TabKey = "information" | "gear" | "quests" | "training";

const TAB_LABELS: Record<TabKey, string> = {
  information: "Information",
  gear: "Gear",
  quests: "Quests",
  training: "Training",
};

type TabDef = { key: TabKey; label: string; content: string };

export default function NpcTabsCard(props: { meta: any; fallbackInfo?: string | null }) {
  const tabs = useMemo<TabDef[]>(() => {
    const raw = (props.meta?.npc_tabs ?? {}) as Record<string, any>;
    const base: Record<TabKey, { enabled: boolean; content: string }> = {
      information: {
        enabled: raw?.information?.enabled !== false,
        content: String(raw?.information?.content ?? props.fallbackInfo ?? "").trim(),
      },
      gear: {
        enabled: Boolean(raw?.gear?.enabled),
        content: String(raw?.gear?.content ?? "").trim(),
      },
      quests: {
        enabled: Boolean(raw?.quests?.enabled),
        content: String(raw?.quests?.content ?? "").trim(),
      },
      training: {
        enabled: Boolean(raw?.training?.enabled),
        content: String(raw?.training?.content ?? "").trim(),
      },
    };

    return (Object.keys(TAB_LABELS) as TabKey[])
      .filter((k) => base[k].enabled)
      .map((k) => ({ key: k, label: TAB_LABELS[k], content: base[k].content || "No details yet." }));
  }, [props.meta, props.fallbackInfo]);

  const [active, setActive] = useState<TabKey>((tabs[0]?.key ?? "information") as TabKey);

  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0] ?? null;
  if (!activeTab) return null;

  return (
    <div className="mt-3 rounded-lg border border-neutral-700 bg-neutral-950/40 p-3">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={[
              "rounded-lg border px-2 py-1 text-xs",
              activeTab.key === t.key
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                : "border-neutral-700 text-neutral-300 hover:bg-neutral-900",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-3 whitespace-pre-wrap text-sm text-neutral-200">{activeTab.content}</div>
    </div>
  );
}

