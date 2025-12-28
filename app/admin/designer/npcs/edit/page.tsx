export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const raw = searchParams?.id;
  const id = Array.isArray(raw) ? raw[0] : raw;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>EDIT ROUTE IS LIVE ✅</h1>
      <p>If you can see this, routing is fine. Next step is DB/auth.</p>
      <pre>id = {String(id ?? "(missing)")}</pre>
    </div>
  );
}
