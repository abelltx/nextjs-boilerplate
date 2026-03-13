export default function SceneAudioUploadInput(props: { name?: string; multiple?: boolean }) {
  const name = props.name ?? "scene_audio_files";
  const multiple = props.multiple ?? true;

  return (
    <div className="space-y-1">
      <input
        type="file"
        name={name}
        accept="audio/*,.mp3,.wav,.m4a,.ogg"
        multiple={multiple}
        className="w-full border rounded p-2 text-sm"
      />
      <div className="text-[11px] text-gray-500">
        Upload MP3/audio files. Keep files around 6MB or smaller for reliable save.
      </div>
    </div>
  );
}
