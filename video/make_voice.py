"""用 Edge TTS（微軟神經網路語音）產生每段旁白，輸出 voice/<id>.mp3 與 voice/durations.json。"""
import asyncio
import json
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path(__file__).parent
cfg = json.loads((ROOT / "scenes.json").read_text(encoding="utf-8"))
out = ROOT / "voice"
out.mkdir(exist_ok=True)


def duration(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


async def main() -> None:
    durations = {}
    for scene in cfg["scenes"]:
        path = out / f"{scene['id']}.mp3"
        text = scene.get("tts", scene["text"])
        await edge_tts.Communicate(text, cfg["voice"], rate=cfg["rate"]).save(str(path))
        durations[scene["id"]] = round(duration(path), 2)
        print(f"{scene['id']}: {durations[scene['id']]}s")
    (out / "durations.json").write_text(json.dumps(durations, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"total narration: {sum(durations.values()):.1f}s")


asyncio.run(main())
