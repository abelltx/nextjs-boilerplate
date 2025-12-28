export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Fingerprint({ params }: { params: any }) {
  return (
    <pre style={{ padding: 24 }}>
      ROUTE_FINGERPRINT: npcs/[id]/page.tsx{"\n"}
      params: {JSON.stringify(params, null, 2)}
    </pre>
  );
}
