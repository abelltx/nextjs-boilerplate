"use client";

import { useMemo, useState } from "react";

type TabKey = "information" | "gear" | "quests" | "training";
type RuntimeTabKey = "image" | TabKey;

const TAB_LABELS: Record<TabKey, string> = {
  information: "Information",
  gear: "Gear",
  quests: "Quests",
  training: "Training",
};

type TabDef = { key: RuntimeTabKey; label: string; content: string };

export default function NpcTabsCard(props: {
  meta: any;
  fallbackInfo?: string | null;
  imageUrl?: string | null;
  embedded?: boolean;
}) {
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

    const coreTabs = (Object.keys(TAB_LABELS) as TabKey[])
      .filter((k) => base[k].enabled)
      .map((k) => ({ key: k, label: TAB_LABELS[k], content: base[k].content || "No details yet." }));
    if (props.imageUrl) {
      return [{ key: "image" as RuntimeTabKey, label: "Image", content: "" }, ...coreTabs];
    }
    return coreTabs;
  }, [props.meta, props.fallbackInfo]);

  const [active, setActive] = useState<RuntimeTabKey>(
    (tabs.find((t) => t.key === "information")?.key ?? tabs[0]?.key ?? "information") as RuntimeTabKey
  );

  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0] ?? null;
  if (!activeTab) return null;

  return (
    <div className={props.embedded ? "mt-2" : "mt-3 rounded-lg border border-neutral-700 bg-neutral-950/40 p-3"}>
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key as RuntimeTabKey)}
            className={[
              "rounded-lg border px-2 py-1 text-xs",
              activeTab.key === t.key
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                : "border-neutral-700 text-neutral-300 hover:bg-neutral-900",
            ].join(" ")}
          >
            {t.key === "image" && props.imageUrl ? (
              <span className="inline-flex items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={props.imageUrl} alt="NPC thumbnail" className="h-4 w-4 rounded object-cover" />
                <span>{t.label}</span>
              </span>
            ) : (
              t.label
            )}
          </button>
        ))}
      </div>
      {activeTab.key === "image" && props.imageUrl ? (
        <div className="mt-3 rounded-lg border border-neutral-700 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={props.imageUrl} alt="NPC portrait" className="w-full h-auto" />
        </div>
      ) : (
        <div className="mt-3 whitespace-pre-wrap text-sm text-neutral-200">{activeTab.content}</div>
      )}
    </div>
  );
}
