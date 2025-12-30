"use client";

import { useMemo, useState, useTransition } from "react";
import { setNpcTraitIdsAction, setNpcActionIdsAction } from "@/app/actions/npcLinks";

type Trait = { id: string; name: string; trait_type?: string; description?: string };
type Action = { id: string; name: string; activation?: string; description?: string };

export default function NpcTraitActionPicker({
  npcId,
  allTraits,
  allActions,
  selectedTraitIds,
  selectedActionIds,
}: {
  npcId: string;
  allTraits: Trait[];
  allActions: Action[];
  selectedTraitIds: string[];
  selectedActionIds: string[];
}) {
  const [traitQ, setTraitQ] = useState("");
  const [actionQ, setActionQ] = useState("");
  const [traits, setTraits] = useState<string[]>(selectedTraitIds);
  const [actions, setActions] = useState<string[]>(selectedActionIds);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string>("");

  const filteredTraits = useMemo(() => {
    const q = traitQ.trim().toLowerCase();
    if (!q) return allTraits;
    return allTraits.filter((t) => t.name.toLowerCase().includes(q));
  }, [allTraits, traitQ]);

  const filteredActions = useMemo(() => {
    const q = actionQ.trim().toLowerCase();
    if (!q) return allActions;
    return allActions.filter((a) => a.name.toLowerCase().includes(q));
  }, [allActions, actionQ]);

  function toggle(list: string[], setList: (next: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function save() {
    setStatus("Saving…");
    startTransition(async () => {
      try {
        await Promise.all([
          setNpcTraitIdsAction(npcId, traits),
          setNpcActionIdsAction(npcId, actions),
        ]);
        setStatus("Saved ✓");
        setTimeout(() => setStatus(""), 1200);
      } catch (e: any) {
        setStatus(e?.message ?? "Save failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="px-3 py-2 rounded-lg border hover:bg-muted/40 disabled:opacity-50"
          onClick={save}
          disabled={isPending}
        >
          Save Traits & Actions
        </button>
        <div className="text-sm text-muted-foreground">{status}</div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Traits</h3>
            <div className="text-xs text-muted-foreground">{traits.length} selected</div>
          </div>

          <input
            className="w-full border rounded-lg p-2"
            placeholder="Search traits…"
            value={traitQ}
            onChange={(e) => setTraitQ(e.target.value)}
          />

          <div className="max-h-[360px] overflow-auto space-y-2">
            {filteredTraits.map((t) => {
              const checked = traits.includes(t.id);
              return (
                <label key={t.id} className="flex items-start gap-2 p-2 border rounded-lg hover:bg-muted/30">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={() => toggle(traits, setTraits, t.id)}
                  />
                  <div>
                    <div className="font-medium text-sm">{t.name}</div>
                    {t.trait_type ? <div className="text-xs text-muted-foreground">{t.trait_type}</div> : null}
                    {t.description ? <div className="text-xs text-muted-foreground line-clamp-2">{t.description}</div> : null}
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Actions</h3>
            <div className="text-xs text-muted-foreground">{actions.length} selected</div>
          </div>

          <input
            className="w-full border rounded-lg p-2"
            placeholder="Search actions…"
            value={actionQ}
            onChange={(e) => setActionQ(e.target.value)}
          />

          <div className="max-h-[360px] overflow-auto space-y-2">
            {filteredActions.map((a) => {
              const checked = actions.includes(a.id);
              return (
                <label key={a.id} className="flex items-start gap-2 p-2 border rounded-lg hover:bg-muted/30">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={() => toggle(actions, setActions, a.id)}
                  />
                  <div>
                    <div className="font-medium text-sm">{a.name}</div>
                    {a.activation ? <div className="text-xs text-muted-foreground">{a.activation}</div> : null}
                    {a.description ? <div className="text-xs text-muted-foreground line-clamp-2">{a.description}</div> : null}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
