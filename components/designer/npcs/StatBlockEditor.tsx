"use client";

import { useMemo, useState } from "react";

export default function StatBlockEditor({ initial }: { initial: any }) {
  const [jsonText, setJsonText] = useState<string>(() => JSON.stringify(initial ?? {}, null, 2));

  const isValid = useMemo(() => {
    try { JSON.parse(jsonText); return true; } catch { return false; }
  }, [jsonText]);

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        For now this is a JSON editor. Next we'll add a friendly form + JSON toggle.
      </p>

      <textarea
        className="w-full border rounded-lg p-2 font-mono text-xs"
        rows={14}
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
      />

      <input type="hidden" name="stat_block_json" value={jsonText} />

      {!isValid && (
        <div className="text-sm text-red-600">
          Invalid JSON. Fix it before saving.
        </div>
      )}
    </div>
  );
}
