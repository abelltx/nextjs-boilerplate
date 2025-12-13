import { createSession, getMySessions } from './actions';

export default async function StorytellerSessionsPage() {
  const sessions = await getMySessions();

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Storyteller Sessions</h1>
          <p className="text-sm text-gray-600">Create a session. Share the join code with players.</p>
        </div>

        <form action={createSession} className="flex gap-2">
          <input
            name="name"
            placeholder="Session name"
            className="border rounded px-3 py-2 w-64"
            required
          />
          <button className="rounded bg-black text-white px-4 py-2">Create</button>
        </form>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        {sessions.map(s => (
          <a
            key={s.id}
            href={`/storyteller/sessions/${s.id}`}
            className="border rounded-xl p-4 hover:bg-gray-50"
          >
            <div className="font-semibold text-lg">{s.name}</div>
            <div className="text-sm text-gray-600">Join Code: <span className="font-mono font-semibold">{s.join_code}</span></div>
          </a>
        ))}
      </div>
    </div>
  );
}
