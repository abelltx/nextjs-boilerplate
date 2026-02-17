"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type TabKey = "information" | "gear" | "quests" | "training";
type RuntimeTabKey = "image" | TabKey;

const TAB_LABELS: Record<TabKey, string> = {
  information: "Information",
  gear: "Gear",
  quests: "Quests",
  training: "Training",
};

type TabDef = { key: RuntimeTabKey; label: string; content: string };
type GearItem = {
  id: string;
  itemId: string;
  name: string;
  description: string;
  faithRequired: number;
};
type TrainingTrait = {
  id: string;
  traitId: string;
  name: string;
  description: string;
};

export default function NpcTabsCard(props: {
  meta: any;
  fallbackInfo?: string | null;
  imageUrl?: string | null;
  embedded?: boolean;
  playerShop?: {
    faithPoints: number;
    ownedItems: string[];
    ownedTraits?: string[];
    claimingId?: string | null;
    claimingTraitId?: string | null;
    onClaim?: (item: GearItem) => void | Promise<void>;
    onClaimTraining?: (trait: TrainingTrait) => void | Promise<void>;
  };
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
  const snapshotRaw = JSON.stringify(props.meta?.npc_tabs?.gear?.item_snapshots ?? []);
  const supabase = useMemo(() => createClient(), []);
  const gearItemIds = useMemo<string[]>(() => {
    const itemIds = props.meta?.npc_tabs?.gear?.item_ids;
    if (Array.isArray(itemIds)) {
      return Array.from(new Set(itemIds.map((v: any) => String(v ?? "").trim()).filter(Boolean)));
    }
    const legacy = props.meta?.npc_tabs?.gear?.items;
    if (Array.isArray(legacy)) {
      return Array.from(
        new Set(
          legacy
            .map((it: any) => String(it?.item_id ?? it?.id ?? "").trim())
            .filter(Boolean)
        )
      );
    }
    return [];
  }, [props.meta]);
  const gearItemIdsKey = JSON.stringify(gearItemIds);
  const trainingSnapshotRaw = JSON.stringify(props.meta?.npc_tabs?.training?.trait_snapshots ?? []);
  const trainingTraitIds = useMemo<string[]>(() => {
    const traitIds = props.meta?.npc_tabs?.training?.trait_ids;
    if (Array.isArray(traitIds)) {
      return Array.from(new Set(traitIds.map((v: any) => String(v ?? "").trim()).filter(Boolean)));
    }
    return [];
  }, [props.meta]);
  const trainingTraitIdsKey = JSON.stringify(trainingTraitIds);
  const snapshotItems = useMemo<GearItem[]>(() => {
    const raw = JSON.parse(snapshotRaw || "[]");
    const arr = Array.isArray(raw) ? raw : [];
    return arr
      .map((it: any, idx: number) => {
        const itemId = String(it?.id ?? "").trim();
        if (!itemId) return null;
        return {
          id: `gear-snapshot-${itemId}-${idx + 1}`,
          itemId,
          name: String(it?.name ?? "").trim(),
          description: "",
          faithRequired: Math.max(0, Number(it?.faith_required ?? 0)),
        } as GearItem;
      })
      .filter((it: any): it is GearItem => Boolean(it?.name));
  }, [snapshotRaw]);
  const [gearItems, setGearItems] = useState<GearItem[]>(snapshotItems);
  const trainingSnapshotItems = useMemo<TrainingTrait[]>(() => {
    const raw = JSON.parse(trainingSnapshotRaw || "[]");
    const arr = Array.isArray(raw) ? raw : [];
    return arr
      .map((it: any, idx: number) => {
        const traitId = String(it?.id ?? "").trim();
        if (!traitId) return null;
        return {
          id: `training-snapshot-${traitId}-${idx + 1}`,
          traitId,
          name: String(it?.name ?? "").trim(),
          description: "",
        } as TrainingTrait;
      })
      .filter((it: any): it is TrainingTrait => Boolean(it?.name));
  }, [trainingSnapshotRaw]);
  const [trainingTraits, setTrainingTraits] = useState<TrainingTrait[]>(trainingSnapshotItems);

  useEffect(() => {
    setGearItems(snapshotItems);
  }, [snapshotRaw]);
  useEffect(() => {
    setTrainingTraits(trainingSnapshotItems);
  }, [trainingSnapshotRaw]);

  useEffect(() => {
    let alive = true;
    async function loadItems() {
      if (!gearItemIds.length) {
        if (alive) setGearItems([]);
        return;
      }
      const { data, error } = await supabase
        .from("items")
        .select("id,name,summary,faith_required")
        .in("id", gearItemIds);
      if (!alive) return;
      if (error || !data) {
        if (!snapshotItems.length) setGearItems([]);
        return;
      }
      const byId = new Map<string, any>();
      for (const row of data as any[]) byId.set(String(row.id), row);
      const mapped = gearItemIds
        .map((itemId, idx) => {
          const row = byId.get(itemId);
          if (!row) return null;
          return {
            id: `gear-${itemId}-${idx + 1}`,
            itemId,
            name: String(row.name ?? "").trim(),
            description: String(row.summary ?? "").trim(),
            faithRequired: Math.max(0, Number(row.faith_required ?? 0)),
          } as GearItem;
        })
        .filter((it): it is GearItem => Boolean(it?.name));
      setGearItems(mapped);
    }
    void loadItems();
    return () => {
      alive = false;
    };
  }, [supabase, gearItemIdsKey, snapshotRaw]);
  useEffect(() => {
    let alive = true;
    async function loadTraits() {
      if (!trainingTraitIds.length) {
        if (alive) setTrainingTraits([]);
        return;
      }
      const { data, error } = await supabase
        .from("traits")
        .select("id,name,summary")
        .in("id", trainingTraitIds);
      if (!alive) return;
      if (error || !data) {
        if (!trainingSnapshotItems.length) setTrainingTraits([]);
        return;
      }
      const byId = new Map<string, any>();
      for (const row of data as any[]) byId.set(String(row.id), row);
      const mapped = trainingTraitIds
        .map((traitId, idx) => {
          const row = byId.get(traitId);
          if (!row) return null;
          return {
            id: `training-${traitId}-${idx + 1}`,
            traitId,
            name: String(row.name ?? "").trim(),
            description: String(row.summary ?? "").trim(),
          } as TrainingTrait;
        })
        .filter((it): it is TrainingTrait => Boolean(it?.name));
      setTrainingTraits(mapped);
    }
    void loadTraits();
    return () => {
      alive = false;
    };
  }, [supabase, trainingTraitIdsKey, trainingSnapshotRaw]);

  const ownedSet = useMemo(
    () => new Set((props.playerShop?.ownedItems ?? []).map((n) => String(n).trim().toLowerCase())),
    [props.playerShop?.ownedItems]
  );
  const ownedTraitSet = useMemo(
    () => new Set((props.playerShop?.ownedTraits ?? []).map((n) => String(n).trim().toLowerCase())),
    [props.playerShop?.ownedTraits]
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
      ) : activeTab.key === "gear" && gearItems.length ? (
        <div className="mt-3 space-y-2">
          {gearItems
            .filter((it) => !ownedSet.has(it.itemId.toLowerCase()))
            .map((it) => {
              const required = Number.isFinite(it.faithRequired) ? it.faithRequired : 0;
              const faith = Number(props.playerShop?.faithPoints ?? 0);
              const locked = faith < required;
              return (
                <div key={it.id} className="rounded-lg border border-neutral-700 bg-neutral-950/50 px-2 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-neutral-100 truncate">{it.name}</div>
                    <div className="text-[11px] text-neutral-400">Free</div>
                  </div>
                  {it.description ? <div className="mt-1 text-xs text-neutral-300">{it.description}</div> : null}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className={["text-[11px]", locked ? "text-neutral-400" : "text-emerald-300"].join(" ")}>
                      {required > 0 ? (locked ? `Requires ${required} faith (you have ${faith})` : `Faith ${required}+ unlocked`) : "No faith requirement"}
                    </div>
                    {props.playerShop?.onClaim ? (
                      <button
                        type="button"
                        className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={locked || props.playerShop?.claimingId === it.id}
                        onClick={() => props.playerShop?.onClaim?.(it)}
                      >
                        {props.playerShop?.claimingId === it.id ? "Adding..." : "Purchase"}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          {gearItems.filter((it) => !ownedSet.has(it.itemId.toLowerCase())).length === 0 ? (
            <div className="text-sm text-neutral-400">You already own all available gear from this NPC.</div>
          ) : null}
        </div>
      ) : activeTab.key === "training" && trainingTraits.length ? (
        <div className="mt-3 space-y-2">
          {trainingTraits
            .filter((it) => !ownedTraitSet.has(it.traitId.toLowerCase()))
            .map((it) => (
              <div key={it.id} className="rounded-lg border border-neutral-700 bg-neutral-950/50 px-2 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-neutral-100 truncate">{it.name}</div>
                  <div className="text-[11px] text-neutral-400">Free</div>
                </div>
                {it.description ? <div className="mt-1 text-xs text-neutral-300">{it.description}</div> : null}
                <div className="mt-2 flex items-center justify-end gap-2">
                  {props.playerShop?.onClaimTraining ? (
                    <button
                      type="button"
                      className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={props.playerShop?.claimingTraitId === it.id}
                      onClick={() => props.playerShop?.onClaimTraining?.(it)}
                    >
                      {props.playerShop?.claimingTraitId === it.id ? "Learning..." : "Learn"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          {trainingTraits.filter((it) => !ownedTraitSet.has(it.traitId.toLowerCase())).length === 0 ? (
            <div className="text-sm text-neutral-400">You already learned all available training from this NPC.</div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 whitespace-pre-wrap text-sm text-neutral-200">{activeTab.content}</div>
      )}
    </div>
  );
}
