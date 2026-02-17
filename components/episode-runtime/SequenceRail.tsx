export default function SequenceRail(props: {
  items: Array<{ id: string; label: string; title: string; stepCount: number }>;
  activeId?: string | null;
}) {
  if (!props.items.length) {
    return <div className="text-xs text-gray-500">No scenes in sequence yet.</div>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {props.items.map((it) => {
        const active = props.activeId === it.id;
        return (
          <div
            key={it.id}
            className={[
              "rounded-full border px-3 py-1 text-xs",
              active ? "border-black bg-black text-white" : "border-gray-300 bg-white text-gray-700",
            ].join(" ")}
            title={`${it.title} (${it.stepCount} step${it.stepCount === 1 ? "" : "s"})`}
          >
            {it.label} - {it.title}
          </div>
        );
      })}
    </div>
  );
}

