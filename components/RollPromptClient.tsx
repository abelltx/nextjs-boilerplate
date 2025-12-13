'use client';

export default function RollPromptClient({
  open,
  prompt,
}: {
  open: boolean;
  prompt: string | null;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="max-w-xl w-full rounded-2xl bg-black text-white p-4 shadow-lg">
        <div className="text-xs uppercase opacity-70">Roll Request</div>
        <div className="text-lg font-bold">{prompt || 'Roll now'}</div>
        <div className="text-sm opacity-80">Use real dice. Tell your Storyteller the result.</div>
      </div>
    </div>
  );
}
