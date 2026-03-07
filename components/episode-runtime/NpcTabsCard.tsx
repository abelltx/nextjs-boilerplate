"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  source: "trait" | "action";
};
type QuestTask = {
  id: string;
  title: string;
  kind: "task" | "talk_to_npc";
  targetNpcBlockId?: string | null;
  targetNpcName?: string | null;
};
type QuestReward = {
  faith: number;
  itemIds: string[];
  itemSnapshots: Array<{ id: string; name: string }>;
};
type QuestDef = {
  id: string;
  title: string;
  directions: string;
  storytellerControlled?: boolean;
  prerequisite?: { enabled: boolean; questId?: string | null };
  tasks: QuestTask[];
  rewards: QuestReward;
};
type QuestProgress = {
  status: "available" | "active" | "completed" | "claimed";
  completedTaskIds: string[];
  claimedAt?: string | null;
};

export default function NpcTabsCard(props: {
  meta: any;
  fallbackInfo?: string | null;
  imageUrl?: string | null;
  embedded?: boolean;
  hideInformationText?: boolean;
  npcContextIds?: string[];
  defaultTab?: RuntimeTabKey;
  enableImageLightbox?: boolean;
  playerShop?: {
    characterId?: string;
    faithPoints: number;
    ownedItems: string[];
    ownedTraits?: string[];
    ownedActions?: string[];
    questProgress?: Record<string, QuestProgress>;
    claimingId?: string | null;
    claimingTraitId?: string | null;
    claimingQuestId?: string | null;
    onClaim?: (item: GearItem) => void | Promise<void>;
    onClaimTraining?: (trait: TrainingTrait) => void | Promise<void>;
    onQuestStart?: (quest: QuestDef) => void | Promise<void>;
    onQuestTask?: (quest: QuestDef, task: QuestTask) => void | Promise<void>;
    onQuestClaim?: (quest: QuestDef) => void | Promise<void>;
  };
}) {
  const linkedNpc = (props.meta?.npc_library ?? null) as any;
  const boundNpcId = String(props.meta?.npc_binding?.npc_id ?? "").trim();
  const libraryNpcId = String(props.meta?.npc_library?.npc_id ?? "").trim();
  const mergedImageUrl =
    String(linkedNpc?.full_image_url ?? props.imageUrl ?? linkedNpc?.image_url ?? "").trim() || null;
  const mergedThumbUrl =
    String(linkedNpc?.thumb_url ?? linkedNpc?.image_url ?? props.imageUrl ?? "").trim() || null;
  const mergedFallbackInfo = String(props.fallbackInfo ?? linkedNpc?.description ?? "").trim();
  const tabs = useMemo<TabDef[]>(() => {
    const raw = (props.meta?.npc_tabs ?? {}) as Record<string, any>;
    const base: Record<TabKey, { enabled: boolean; content: string }> = {
      information: {
        enabled: raw?.information?.enabled !== false,
        content: props.hideInformationText
          ? ""
          : String(raw?.information?.content ?? mergedFallbackInfo ?? "").trim(),
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
    if (mergedImageUrl) {
      return [{ key: "image" as RuntimeTabKey, label: "Image", content: "" }, ...coreTabs];
    }
    return coreTabs;
  }, [props.meta, mergedFallbackInfo, mergedImageUrl, props.hideInformationText]);

  const [active, setActive] = useState<RuntimeTabKey>(
    (() => {
      const requested = String(props.defaultTab ?? "").trim() as RuntimeTabKey;
      if (requested && tabs.some((t) => t.key === requested)) return requested;
      return (tabs.find((t) => t.key === "information")?.key ?? tabs[0]?.key ?? "information") as RuntimeTabKey;
    })()
  );
  const [imageOpen, setImageOpen] = useState(false);
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
  const trainingAllIds = useMemo<string[]>(() => {
    const allIds = props.meta?.npc_tabs?.training?.training_ids;
    const traitIds = props.meta?.npc_tabs?.training?.trait_ids;
    const actionIds = props.meta?.npc_tabs?.training?.action_ids;
    const merged = [
      ...(Array.isArray(allIds) ? allIds : []),
      ...(Array.isArray(traitIds) ? traitIds : []),
      ...(Array.isArray(actionIds) ? actionIds : []),
    ];
    return Array.from(new Set(merged.map((v: any) => String(v ?? "").trim()).filter(Boolean)));
  }, [props.meta]);
  const trainingTraitIds = useMemo<string[]>(() => {
    const traitIds = props.meta?.npc_tabs?.training?.trait_ids;
    if (Array.isArray(traitIds) && traitIds.length) {
      return Array.from(new Set(traitIds.map((v: any) => String(v ?? "").trim()).filter(Boolean)));
    }
    return trainingAllIds;
  }, [props.meta, trainingAllIds]);
  const trainingActionIds = useMemo<string[]>(() => {
    const actionIds = props.meta?.npc_tabs?.training?.action_ids;
    if (Array.isArray(actionIds) && actionIds.length) {
      return Array.from(new Set(actionIds.map((v: any) => String(v ?? "").trim()).filter(Boolean)));
    }
    return trainingAllIds;
  }, [props.meta, trainingAllIds]);
  const trainingIdsKey = JSON.stringify([...trainingTraitIds, ...trainingActionIds].sort());
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
  const [talkTargetNameMap, setTalkTargetNameMap] = useState<Record<string, string>>({});
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
          source: "trait",
        } as TrainingTrait;
      })
      .filter((it: any): it is TrainingTrait => Boolean(it?.name));
  }, [trainingSnapshotRaw]);
  const trainingActionSnapshotRaw = JSON.stringify(props.meta?.npc_tabs?.training?.action_snapshots ?? []);
  const trainingUnknownSnapshotRaw = JSON.stringify(props.meta?.npc_tabs?.training?.unknown_snapshots ?? []);
  const questDefsRaw = JSON.stringify(props.meta?.npc_tabs?.quests?.quest_defs ?? []);
  const trainingActionSnapshotItems = useMemo<TrainingTrait[]>(() => {
    const raw = JSON.parse(trainingActionSnapshotRaw || "[]");
    const arr = Array.isArray(raw) ? raw : [];
    return arr
      .map((it: any, idx: number) => {
        const actionId = String(it?.id ?? "").trim();
        if (!actionId) return null;
        return {
          id: `training-action-snapshot-${actionId}-${idx + 1}`,
          traitId: actionId,
          name: String(it?.name ?? "").trim(),
          description: "",
          source: "action",
        } as TrainingTrait;
      })
      .filter((it: any): it is TrainingTrait => Boolean(it?.name));
  }, [trainingActionSnapshotRaw]);
  const [trainingTraits, setTrainingTraits] = useState<TrainingTrait[]>([...trainingSnapshotItems, ...trainingActionSnapshotItems]);
  const trainingUnknownSnapshotItems = useMemo<TrainingTrait[]>(() => {
    const raw = JSON.parse(trainingUnknownSnapshotRaw || "[]");
    const arr = Array.isArray(raw) ? raw : [];
    return arr
      .map((it: any, idx: number) => {
        const id = String(it?.id ?? "").trim();
        if (!id) return null;
        return {
          id: `training-unknown-snapshot-${id}-${idx + 1}`,
          traitId: id,
          name: String(it?.name ?? id).trim(),
          description: "",
          source: "trait",
        } as TrainingTrait;
      })
      .filter((it: any): it is TrainingTrait => Boolean(it?.name));
  }, [trainingUnknownSnapshotRaw]);
  const questDefs = useMemo<QuestDef[]>(() => {
    const raw = JSON.parse(questDefsRaw || "[]");
    const arr = Array.isArray(raw) ? raw : [];
    return arr
      .map((q: any, idx: number) => {
        const questId = String(q?.id ?? "").trim() || `quest_${idx + 1}`;
        const title = String(q?.title ?? "").trim() || `Quest ${idx + 1}`;
        const directions = String(q?.directions ?? "").trim();
        const tasksRaw = Array.isArray(q?.tasks) ? q.tasks : [];
        const tasks = tasksRaw
          .map((t: any, tIdx: number) => {
            const taskId = String(t?.id ?? "").trim() || `${questId}_task_${tIdx + 1}`;
            const kind = String(t?.kind ?? "").trim().toLowerCase() === "talk_to_npc" ? "talk_to_npc" : "task";
            const targetNpcName = String(t?.target_npc_name ?? "").trim() || null;
            const fallbackTalkTitle = targetNpcName
              ? `Talk to ${targetNpcName}`
              : `Talk to NPC (${String(t?.target_npc_block_id ?? "").trim().slice(0, 8)}...)`;
            const taskTitle = String(t?.title ?? "").trim() || (kind === "talk_to_npc" ? fallbackTalkTitle : "");
            if (!taskTitle) return null;
            return {
              id: taskId,
              title: taskTitle,
              kind,
              targetNpcBlockId: String(t?.target_npc_block_id ?? "").trim() || null,
              targetNpcName,
            } as QuestTask;
          })
          .filter((t: any): t is QuestTask => Boolean(t?.title));
        const rewards = q?.rewards ?? {};
        const itemIds = Array.isArray(rewards?.item_ids)
          ? Array.from(new Set(rewards.item_ids.map((v: any) => String(v ?? "").trim()).filter(Boolean)))
          : [];
        const itemSnapshotsRaw = Array.isArray(rewards?.item_snapshots) ? rewards.item_snapshots : [];
        const itemSnapshots = itemSnapshotsRaw
          .map((it: any) => ({
            id: String(it?.id ?? "").trim(),
            name: String(it?.name ?? "").trim(),
          }))
          .filter((it: any) => Boolean(it.id));
        return {
          id: questId,
          title,
          directions,
          storytellerControlled: Boolean(q?.storyteller_controlled),
          prerequisite: {
            enabled: Boolean(q?.prerequisite?.enabled),
            questId: String(q?.prerequisite?.quest_id ?? "").trim() || null,
          },
          tasks,
          rewards: {
            faith: Math.max(0, Number(rewards?.faith ?? 0) || 0),
            itemIds,
            itemSnapshots,
          },
        } as QuestDef;
      })
      .filter((q: any): q is QuestDef => Boolean(q?.id && q?.title));
  }, [questDefsRaw]);
  const talkTargetIds = useMemo(
    () =>
      Array.from(
        new Set(
          questDefs
            .flatMap((q) => q.tasks)
            .filter((t) => t.kind === "talk_to_npc")
            .map((t) => String(t.targetNpcBlockId ?? "").trim())
            .filter(Boolean)
        )
      ),
    [questDefsRaw]
  );
  const talkTargetIdsKey = useMemo(() => JSON.stringify(talkTargetIds), [talkTargetIds]);
  const questProgressKey = useMemo(
    () => JSON.stringify(props.playerShop?.questProgress ?? {}),
    [props.playerShop?.questProgress]
  );

  const autoTaskKeyRef = useRef<string>("");
  const npcContextIdKey = useMemo(
    () =>
      JSON.stringify(
        Array.from(
          new Set(
            [
              ...(Array.isArray(props.npcContextIds) ? props.npcContextIds : []),
              boundNpcId,
              libraryNpcId,
            ]
              .map((v) => String(v ?? "").trim().toLowerCase())
              .filter(Boolean)
          )
        )
      ),
    [props.npcContextIds, boundNpcId, libraryNpcId]
  );

  useEffect(() => {
    setGearItems(snapshotItems);
  }, [snapshotRaw]);
  useEffect(() => {
    setTrainingTraits([...trainingSnapshotItems, ...trainingActionSnapshotItems, ...trainingUnknownSnapshotItems]);
  }, [trainingSnapshotRaw, trainingActionSnapshotRaw, trainingUnknownSnapshotRaw]);
  useEffect(() => {
    let alive = true;
    async function loadTalkNames() {
      if (!talkTargetIds.length) {
        if (alive) setTalkTargetNameMap({});
        return;
      }
      const { data, error } = await supabase
        .from("npcs")
        .select("id,name")
        .in("id", talkTargetIds);
      if (!alive) return;
      if (error || !data) {
        setTalkTargetNameMap({});
        return;
      }
      const map: Record<string, string> = {};
      for (const row of data as any[]) {
        const id = String(row?.id ?? "").trim();
        const name = String(row?.name ?? "").trim();
        if (id && name) map[id.toLowerCase()] = name;
      }
      setTalkTargetNameMap(map);
    }
    void loadTalkNames();
    return () => {
      alive = false;
    };
  }, [supabase, talkTargetIdsKey]);

  useEffect(() => {
    const onQuestTask = props.playerShop?.onQuestTask;
    const questProgress = props.playerShop?.questProgress ?? {};
    if (!onQuestTask) return;
    // Player quest progress is storyteller-driven; do not auto-complete talk tasks on NPC open.
    if (props.playerShop) return;
    const npcTargets = new Set<string>(
      (JSON.parse(npcContextIdKey || "[]") as string[]).map((v) => String(v).toLowerCase())
    );
    if (!npcTargets.size) return;

    for (const quest of questDefs) {
      if (Boolean(quest.storytellerControlled)) continue;
      const progress = questProgress[quest.id];
      const status = progress?.status ?? "available";
      if (status !== "active" && status !== "completed") continue;
      const completed = new Set((progress?.completedTaskIds ?? []).map((v) => String(v)));
      for (const task of quest.tasks) {
        if (task.kind !== "talk_to_npc") continue;
        if (completed.has(task.id)) continue;
        const target = String(task.targetNpcBlockId ?? "").trim().toLowerCase();
        if (!target || !npcTargets.has(target)) continue;
        const key = `${quest.id}:${task.id}:${target}`;
        if (autoTaskKeyRef.current === key) return;
        autoTaskKeyRef.current = key;
        void onQuestTask(quest, task);
        return;
      }
    }
  }, [questDefsRaw, npcContextIdKey, props.playerShop?.onQuestTask, questProgressKey]);

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
      if (!trainingTraitIds.length && !trainingActionIds.length) {
        if (alive) setTrainingTraits([]);
        return;
      }
      const [{ data: traitData, error: traitErr }, { data: actionData, error: actionErr }] = await Promise.all([
        trainingTraitIds.length
          ? supabase.from("traits").select("id,name,summary").in("id", trainingTraitIds)
          : Promise.resolve({ data: [], error: null } as any),
        trainingActionIds.length
          ? supabase.from("actions").select("id,name,summary").in("id", trainingActionIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (!alive) return;
      if (traitErr || actionErr) {
        if (!trainingSnapshotItems.length && !trainingActionSnapshotItems.length && !trainingUnknownSnapshotItems.length) setTrainingTraits([]);
        return;
      }
      const traitById = new Map<string, any>();
      for (const row of (traitData ?? []) as any[]) traitById.set(String(row.id), row);
      const actionById = new Map<string, any>();
      for (const row of (actionData ?? []) as any[]) actionById.set(String(row.id), row);
      const mappedTraits = trainingTraitIds
        .map((traitId, idx) => {
          const row = traitById.get(traitId);
          if (!row) return null;
          return {
            id: `training-trait-${traitId}-${idx + 1}`,
            traitId,
            name: String(row.name ?? "").trim(),
            description: String(row.summary ?? "").trim(),
            source: "trait",
          } as TrainingTrait;
        })
        .filter((it): it is TrainingTrait => Boolean(it?.name));
      const mappedActions = trainingActionIds
        .map((actionId, idx) => {
          const row = actionById.get(actionId);
          if (!row) return null;
          return {
            id: `training-action-${actionId}-${idx + 1}`,
            traitId: actionId,
            name: String(row.name ?? "").trim(),
            description: String(row.summary ?? "").trim(),
            source: "action",
          } as TrainingTrait;
        })
        .filter((it): it is TrainingTrait => Boolean(it?.name));
      setTrainingTraits([...mappedTraits, ...mappedActions, ...trainingUnknownSnapshotItems]);
    }
    void loadTraits();
    return () => {
      alive = false;
    };
  }, [supabase, trainingIdsKey, trainingSnapshotRaw, trainingActionSnapshotRaw, trainingUnknownSnapshotRaw]);

  const ownedSet = useMemo(
    () => new Set((props.playerShop?.ownedItems ?? []).map((n) => String(n).trim().toLowerCase())),
    [props.playerShop?.ownedItems]
  );
  const ownedTraitSet = useMemo(
    () => new Set((props.playerShop?.ownedTraits ?? []).map((n) => String(n).trim().toLowerCase())),
    [props.playerShop?.ownedTraits]
  );
  const ownedActionSet = useMemo(
    () => new Set((props.playerShop?.ownedActions ?? []).map((n) => String(n).trim().toLowerCase())),
    [props.playerShop?.ownedActions]
  );
  const questProgress = props.playerShop?.questProgress ?? {};

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
            {t.key === "image" && mergedImageUrl ? (
              <span className="inline-flex items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mergedThumbUrl || mergedImageUrl} alt="NPC thumbnail" className="h-4 w-4 rounded object-cover" />
                <span>{t.label}</span>
              </span>
            ) : (
              t.label
            )}
          </button>
        ))}
      </div>
      {activeTab.key === "image" && mergedImageUrl ? (
        <div className="mt-3 rounded-lg border border-neutral-700 overflow-hidden">
          {props.enableImageLightbox !== false ? (
            <button type="button" className="block w-full text-left" onClick={() => setImageOpen(true)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mergedImageUrl} alt="NPC portrait" className="w-full h-auto" />
            </button>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mergedImageUrl} alt="NPC portrait" className="w-full h-auto" />
          )}
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
            .filter((it) =>
              it.source === "trait"
                ? !ownedTraitSet.has(it.traitId.toLowerCase())
                : !ownedActionSet.has(it.traitId.toLowerCase())
            )
            .map((it) => (
              <div key={it.id} className="rounded-lg border border-neutral-700 bg-neutral-950/50 px-2 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-neutral-100 truncate">{it.name}</div>
                  <div className="text-[11px] text-neutral-400">{it.source === "trait" ? "Trait" : "Action"}</div>
                </div>
                {it.description ? <div className="mt-1 text-xs text-neutral-300">{it.description}</div> : null}
                <div className="mt-2 flex items-center justify-end gap-2">
                  {props.playerShop?.onClaimTraining ? (
                    <button
                      type="button"
                      className="rounded border border-emerald-500/60 bg-emerald-500/20 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={props.playerShop?.claimingTraitId === it.id}
                      onClick={() => props.playerShop?.onClaimTraining?.(it)}
                    >
                      {props.playerShop?.claimingTraitId === it.id ? "Learning..." : "Learn"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          {trainingTraits.filter((it) =>
            it.source === "trait"
              ? !ownedTraitSet.has(it.traitId.toLowerCase())
              : !ownedActionSet.has(it.traitId.toLowerCase())
          ).length === 0 ? (
            <div className="text-sm text-neutral-400">You already learned all available training from this NPC.</div>
          ) : null}
        </div>
      ) : activeTab.key === "quests" && questDefs.length ? (
        <div className="mt-3 space-y-2">
          {questDefs.map((quest) => {
            const progress = questProgress[quest.id];
            const status = String(progress?.status ?? "available").toLowerCase() as QuestProgress["status"];
            const storytellerControlled = Boolean(quest.storytellerControlled) || Boolean(props.playerShop);
            const prereqEnabled = Boolean(quest.prerequisite?.enabled);
            const prereqQuestId = String(quest.prerequisite?.questId ?? "").trim();
            const prereqProgress = prereqQuestId ? questProgress[prereqQuestId] : null;
            const prereqMet = !prereqEnabled || Boolean(
              prereqQuestId &&
                prereqProgress &&
                (String(prereqProgress.status).toLowerCase() === "completed" ||
                  String(prereqProgress.status).toLowerCase() === "claimed")
            );
            const completedSet = new Set((progress?.completedTaskIds ?? []).map((id) => String(id).trim()));
            const allTasksDone = quest.tasks.length > 0 && quest.tasks.every((t) => completedSet.has(t.id));
            const claimable = status === "completed" || (status === "active" && allTasksDone);
            const rewardItems = quest.rewards.itemIds
              .map((itemId) => {
                const snap = quest.rewards.itemSnapshots.find((s) => s.id === itemId);
                return { id: itemId, name: snap?.name || itemId };
              })
              .filter((it) => !ownedSet.has(it.id.toLowerCase()));

            return (
              <div key={quest.id} className="rounded-lg border border-neutral-700 bg-neutral-950/50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-neutral-100">{quest.title}</div>
                  <div
                    className={[
                      "rounded px-2 py-0.5 text-[11px]",
                      status === "claimed"
                        ? "bg-emerald-500/20 text-emerald-200"
                        : claimable
                          ? "bg-amber-500/20 text-amber-200"
                          : status === "active"
                            ? "bg-blue-500/20 text-blue-200"
                            : "bg-neutral-800 text-neutral-300",
                    ].join(" ")}
                  >
                    {status === "claimed" ? "Claimed" : claimable ? "Ready to claim" : status === "active" ? "Active" : "Available"}
                  </div>
                </div>
                {quest.directions ? <div className="mt-1 text-xs text-neutral-300">{quest.directions}</div> : null}
                {!prereqMet ? (
                  <div className="mt-1 text-[11px] text-amber-300">
                    Locked: complete {prereqQuestId || "the required quest"} first.
                  </div>
                ) : null}
                {storytellerControlled ? (
                  <div className="mt-1 text-[11px] text-amber-300">Progress controlled by storyteller.</div>
                ) : null}

                {quest.tasks.length ? (
                  <div className="mt-2 space-y-1">
                    {quest.tasks.map((task) => {
                      const done = completedSet.has(task.id);
                      const canMark =
                        !done &&
                        (status === "active" || status === "completed") &&
                        !storytellerControlled &&
                        props.playerShop?.onQuestTask &&
                        props.playerShop?.claimingQuestId !== quest.id;
                      return (
                        <div key={task.id} className="flex items-center justify-between gap-2 rounded border border-neutral-800 px-2 py-1">
                          <div className={["text-xs", done ? "text-emerald-200" : "text-neutral-300"].join(" ")}>
                            <span className="mr-1">{done ? "✓" : "○"}</span>
                            {task.kind === "talk_to_npc"
                              ? (() => {
                                  const target = String(task.targetNpcBlockId ?? "").trim().toLowerCase();
                                  const fallbackName = target ? talkTargetNameMap[target] : "";
                                  const name = task.targetNpcName || fallbackName;
                                  return name ? `Talk to ${name}` : task.title;
                                })()
                              : task.title}
                            {task.kind === "talk_to_npc" ? (
                              <span className="ml-2 text-[10px] uppercase text-neutral-400">Talk</span>
                            ) : null}
                          </div>
                          {canMark ? (
                            <button
                              type="button"
                              className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] hover:bg-neutral-900"
                              onClick={() => props.playerShop?.onQuestTask?.(quest, task)}
                            >
                              Done
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div className="mt-2 rounded border border-neutral-800 p-2 text-xs text-neutral-300">
                  <div className="font-semibold text-neutral-200">Rewards</div>
                  {quest.rewards.faith > 0 ? <div>Faith: +{quest.rewards.faith}</div> : null}
                  {rewardItems.length ? (
                    <div className="mt-1">
                      Items: {rewardItems.map((it) => it.name).join(", ")}
                    </div>
                  ) : quest.rewards.itemIds.length ? (
                    <div className="mt-1 text-neutral-400">Items already owned.</div>
                  ) : null}
                  {quest.rewards.faith <= 0 && quest.rewards.itemIds.length === 0 ? (
                    <div className="mt-1 text-neutral-400">No rewards configured.</div>
                  ) : null}
                </div>

                <div className="mt-2 flex items-center justify-end gap-2">
                  {status === "available" ? (
                    storytellerControlled ? null : (
                      <button
                        type="button"
                        className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={
                          !prereqMet ||
                          props.playerShop?.claimingQuestId === quest.id ||
                          !props.playerShop?.onQuestStart
                        }
                        onClick={() => props.playerShop?.onQuestStart?.(quest)}
                      >
                        {props.playerShop?.claimingQuestId === quest.id ? "Starting..." : "Start Quest"}
                      </button>
                    )
                  ) : null}
                  {claimable && storytellerControlled ? (
                    <div className="text-[11px] text-amber-300">Rewards are assigned by storyteller.</div>
                  ) : null}
                  {claimable && !storytellerControlled ? (
                    <button
                      type="button"
                      className="rounded border border-emerald-500/60 bg-emerald-500/20 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={props.playerShop?.claimingQuestId === quest.id || !props.playerShop?.onQuestClaim}
                      onClick={() => props.playerShop?.onQuestClaim?.(quest)}
                    >
                      {props.playerShop?.claimingQuestId === quest.id ? "Claiming..." : "Claim Rewards"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : activeTab.key === "information" && props.hideInformationText ? (
        <div className="mt-3 text-sm text-neutral-300">Listen to the storyteller for this NPC dialogue.</div>
      ) : (
        <div className="mt-3 whitespace-pre-wrap text-sm text-neutral-200">{activeTab.content}</div>
      )}
      {imageOpen && mergedImageUrl ? (
        <div className="fixed inset-0 z-[120] bg-black/80 p-4 flex items-center justify-center" onClick={() => setImageOpen(false)}>
          <div className="relative max-h-[92vh] max-w-[92vw] w-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setImageOpen(false)}
              className="absolute right-2 top-2 rounded border border-white/40 bg-black/50 px-2 py-1 text-xs text-white hover:bg-black/70"
            >
              Close
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mergedImageUrl} alt="NPC full" className="max-h-[90vh] max-w-[90vw] h-auto w-auto rounded-lg border border-white/30" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

