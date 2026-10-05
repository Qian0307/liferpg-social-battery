"""把 AI 影片、錄好的畫面、標題卡、旁白與字幕剪成一支影片：out/LifeRPG-demo.mp4。

每一段的長度 = 旁白長度 + 前後留白。畫面比旁白長就加速（最多 3 倍），比旁白短就停在最後一格。
"""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
BUILD = ROOT / "build"
NORM = BUILD / "norm"
OUT = ROOT / "out"
for d in (BUILD, NORM, OUT):
    d.mkdir(exist_ok=True)

cfg = json.loads((ROOT / "scenes.json").read_text(encoding="utf-8-sig"))
durations = json.loads((ROOT / "voice" / "durations.json").read_text(encoding="utf-8"))
LEAD, TAIL, FADE = 0.35, 0.6, 0.25
W, H, FPS = 1920, 1080, 30
BG = "0xf5f3fa"


def run(args, cwd=None):
    subprocess.run(args, check=True, cwd=cwd)


def probe(path: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def normalize(src: Path) -> Path:
    """統一成 1920×1080、30fps、H.264；有音軌就保留（AI 影片的環境音）。"""
    dst = NORM / (src.stem + ".mp4")
    vf = f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color={BG},fps={FPS},setsar=1"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2", str(dst)])
    return dst


def ass_time(t: float) -> str:
    h, rem = divmod(max(0.0, t), 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def write_subtitles(scene_id: str, text: str, narration: float) -> Path:
    """依標點切句、每行最多約 22 字，時間按字數比例分配在旁白長度內。"""
    pieces = [p for p in re.split(r"(?<=[，。；？！])", text) if p.strip()]
    lines, cur = [], ""
    for p in pieces:
        if cur and len(cur) + len(p) > 22:
            lines.append(cur)
            cur = p
        else:
            cur += p
    if cur:
        lines.append(cur)
    total = sum(len(x) for x in lines)
    t = LEAD
    events = []
    for line in lines:
        d = narration * len(line) / total
        shown = line.rstrip("，。；")
        events.append(f"Dialogue: 0,{ass_time(t)},{ass_time(t + d)},Default,,0,0,0,,{shown}")
        t += d
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft JhengHei,52,&H00FFFFFF,&H000000FF,&HA0201E32,&HA0201E32,-1,0,0,0,100,100,1,0,3,14,0,2,120,120,56,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    path = BUILD / f"{scene_id}.ass"
    path.write_text(header + "\n".join(events) + "\n", encoding="utf-8")
    return path


def build_scene(scene: dict) -> Path:
    sid = scene["id"]
    narration = durations[sid]
    total = round(narration + LEAD + TAIL, 2)
    voice = ROOT / "voice" / f"{sid}.mp3"
    sub = write_subtitles(sid, scene["text"], narration)
    out = BUILD / f"scene-{sid}.mp4"
    fade = f"fade=t=in:st=0:d={FADE},fade=t=out:st={total - FADE:.2f}:d={FADE}"
    subs = f"subtitles={sub.name}"

    if scene["kind"] == "card":
        card = ROOT / "cards" / f"{sid}.png"
        # 標題卡加一點緩慢推近，避免完全靜止
        zoom = f"zoompan=z='min(1+0.0006*on,1.05)':d={int(total * FPS)}:s={W}x{H}:fps={FPS}"
        vf = f"[0:v]scale={W * 2}:{H * 2},{zoom},{fade},{subs}[v]"
        af = f"[1:a]adelay={int(LEAD * 1000)}|{int(LEAD * 1000)},apad,atrim=0:{total}[a]"
        run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-t", str(total), "-i", str(card), "-i", str(voice),
             "-filter_complex", f"{vf};{af}", "-map", "[v]", "-map", "[a]", "-t", str(total),
             "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS),
             "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k", str(out)], cwd=BUILD)
        return out

    clips = [normalize(ROOT / m) for m in scene["media"]]
    joined = BUILD / f"joined-{sid}.mp4"
    if len(clips) == 1:
        joined = clips[0]
    else:
        lst = BUILD / f"list-{sid}.txt"
        lst.write_text("".join(f"file '{c.as_posix()}'\n" for c in clips), encoding="utf-8")
        run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(joined)])
    length = probe(joined)
    speed = length / total
    if speed > 1:
        timing = f"setpts=PTS/{min(speed, 3.0):.4f},trim=0:{total},setpts=PTS-STARTPTS"
    else:
        timing = f"tpad=stop_mode=clone:stop_duration={total - length + 0.1:.2f},trim=0:{total}"
    vf = f"[0:v]{timing},{fade},{subs}[v]"
    has_ambience = sid.startswith(("00-", "01-"))
    narr = f"[1:a]adelay={int(LEAD * 1000)}|{int(LEAD * 1000)},apad,atrim=0:{total}"
    if has_ambience:
        af = f"{narr}[n];[0:a]volume=0.22,apad,atrim=0:{total}[amb];[n][amb]amix=inputs=2:duration=first:normalize=0[a]"
    else:
        af = f"{narr}[a]"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(joined), "-i", str(voice),
         "-filter_complex", f"{vf};{af}", "-map", "[v]", "-map", "[a]", "-t", str(total),
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS),
         "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k", str(out)], cwd=BUILD)
    return out


scenes_out = []
for scene in cfg["scenes"]:
    print("building", scene["id"])
    scenes_out.append(build_scene(scene))

final_list = BUILD / "final.txt"
final_list.write_text("".join(f"file '{p.as_posix()}'\n" for p in scenes_out), encoding="utf-8")
final = OUT / "LifeRPG-demo.mp4"
joined_all = BUILD / "joined-all.mp4"
run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(final_list), "-c", "copy", str(joined_all)])
# 整支影片的音量標準化到線上影片常用的響度（約 -16 LUFS），畫面直接複製不重新編碼
run(["ffmpeg", "-v", "error", "-y", "-i", str(joined_all), "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
     "-c:a", "aac", "-ar", "48000", "-b:a", "192k", "-movflags", "+faststart", str(final)])
print(f"done: {final}  ({probe(final):.1f}s)")
