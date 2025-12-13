import { joinSession } from './actions';

export default function PlayerJoinPage() {
  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Join a Session</h1>
      <form action={joinSession} className="space-y-3">
        <input
          name="join_code"
          placeholder="Enter join code"
          className="border rounded px-3 py-2 w-full font-mono uppercase"
          required
        />
        <button className="w-full rounded bg-black text-white py-2">Join</button>
      </form>
    </div>
  );
}
