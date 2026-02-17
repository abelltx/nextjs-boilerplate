export type MapMarker = {
  id: string;
  label: string;
  x: number;
  y: number;
  targetBlockId: string | null;
};

export type RuntimeBlock = {
  id: string;
  sort_order: number;
  block_type: string;
  audience: string;
  mode: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  meta?: any;
};

export function isSceneBlock(b: RuntimeBlock) {
  return String(b.block_type).toLowerCase() === "scene";
}

export function isPresentableBlock(b: RuntimeBlock) {
  return String(b.audience).toLowerCase() !== "storyteller";
}

export function extractMapMarkers(meta: any): MapMarker[] {
  const list = Array.isArray(meta?.markers) ? meta.markers : [];
  return list
    .map((m: any, i: number) => ({
      id: String(m?.id ?? `m-${i + 1}`),
      label: String(m?.label ?? `Marker ${i + 1}`),
      x: Number(m?.x ?? 50),
      y: Number(m?.y ?? 50),
      targetBlockId: m?.target_block_id ? String(m.target_block_id) : null,
    }))
    .filter((m: MapMarker) => Number.isFinite(m.x) && Number.isFinite(m.y));
}

export function buildRuntimeSequence(scenes: Array<{ scene: RuntimeBlock; children: RuntimeBlock[] }>) {
  return scenes.map((s, si) => ({
    id: s.scene.id,
    label: `S${si + 1}`,
    title: s.scene.title ?? `Scene ${si + 1}`,
    stepCount: s.children.filter(isPresentableBlock).length,
  }));
}

