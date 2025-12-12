import { supabase } from "../../lib/supabaseClient";

export default async function TestPage() {
  const { data, error } = await supabase
    .from("test_messages")
    .select("*")
    .limit(20);

  return (
    <div style={{ padding: 40 }}>
      <h1>Supabase Connection Test</h1>
      {error ? (
        <pre>ERROR: {JSON.stringify(error, null, 2)}</pre>
      ) : (
        <pre>{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}
