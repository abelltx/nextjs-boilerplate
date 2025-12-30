"use client";

export default function DeleteActionButton({ id, action }: { id: string; action: any }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const ok = confirm(
          "Delete this action permanently?\n\nThis cannot be undone."
        );
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-md border px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Delete
      </button>
    </form>
  );
}
