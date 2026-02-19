"use client";

function formatDay(ts: string) {
  const d = new Date(ts);
  // Simple grouping label; you can upgrade to locale/timezone later
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function iconFor(type: string) {
  switch (type) {
    case "quest_started": return "🧭";
    case "quest_complete": return "✅";
    case "episode_complete": return "📜";
    case "faith_earned": return "✨";
    case "faith_spent": return "🕯️";
    case "talent_unlocked": return "🌿";
    case "item_acquired": return "🎒";
    case "elder_visit": return "⛺";
    default: return "•";
  }
}

export default function JourneyLog(props: {
  items: Array<any>;
  compact?: boolean;
  onOpenItem?: (itemId: string) => void;
}) {
  const items = props.items ?? [];

  if (items.length === 0) {
    return <div className="text-sm text-neutral-400">No journey entries yet.</div>;
  }

  // Group by day label
  const groups: Record<string, any[]> = {};
  for (const it of items) {
    const day = it.created_at ? formatDay(it.created_at) : "Unknown";
    groups[day] = groups[day] ?? [];
    groups[day].push(it);
  }

  const days = Object.keys(groups);

  return (
    <div className="space-y-4">
      {days.map((day) => (
        <div key={day}>
          {!props.compact ? (
            <div className="mb-2 text-xs uppercase tracking-wide text-neutral-400">{day}</div>
          ) : null}

          <div className="space-y-2">
            {groups[day].slice(0, props.compact ? 5 : 999).map((it) => (
              <div key={it.id ?? `${it.created_at}-${it.title}`} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                {(() => {
                  const summaryRaw = String(it.summary ?? "");
                  const itemMatch = summaryRaw.match(/\[item_id:([0-9a-f-]{36})\]/i);
                  const summaryText = summaryRaw.replace(/\s*\[item_id:[0-9a-f-]{36}\]\s*/gi, "").trim();
                  return (
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 w-5 text-center text-sm">{iconFor(it.event_type ?? "")}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white">
                      {it.title ?? "Update"}
                    </div>
                    {summaryText ? (
                      <div className="mt-1 text-sm text-neutral-300">
                        {summaryText}
                      </div>
                    ) : null}
                    {itemMatch?.[1] && props.onOpenItem ? (
                      <div className="mt-2">
                        <button
                          type="button"
                          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
                          onClick={() => {
                            props.onOpenItem?.(itemMatch[1]);
                          }}
                        >
                          Examine Item
                        </button>
                      </div>
                    ) : null}

                    {!props.compact ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-400">
                        {it.session_id ? <span className="rounded-full bg-neutral-800 px-2 py-1">Session</span> : null}
                        {it.episode_id ? <span className="rounded-full bg-neutral-800 px-2 py-1">Episode</span> : null}
                        {it.event_type ? <span className="rounded-full bg-neutral-800 px-2 py-1">{it.event_type}</span> : null}
                      </div>
                    ) : null}
                  </div>

                  {!props.compact && it.created_at ? (
                    <div className="text-xs text-neutral-500">
                      {new Date(it.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  ) : null}
                </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
