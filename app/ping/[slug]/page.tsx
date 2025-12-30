export const dynamic = "force-dynamic";

export default function PingSlug({
  params,
}: {
  params: { slug?: string };
}) {
  return (
    <pre style={{ padding: 24 }}>
      {JSON.stringify(
        {
          ok: true,
          where: "app/ping/[slug]/page.tsx",
          params,
        },
        null,
        2
      )}
    </pre>
  );
}
