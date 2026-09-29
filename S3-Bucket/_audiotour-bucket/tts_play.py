import sys
import os
import requests
import base64
import json
from datetime import datetime
from pathlib import Path
import glob

# ====================== GROK TTS SETUP (Eve British English) ======================
GROK_API_KEY = os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY")
if not GROK_API_KEY:
    raise SystemExit("Set XAI_API_KEY (or GROK_API_KEY) in the environment; do not hardcode secrets.")

def generate_grok_eve_audio(text: str) -> str:
    print(f"🔊 Generating Grok Eve audio for: {text[:60]}...")
    
    url = "https://api.x.ai/v1/tts"
    payload = {
        "text": text,
        "voice_id": "leo",
        "language": "en"
    }
    headers = {
        "Authorization": f"Bearer {GROK_API_KEY}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=60)
        response.raise_for_status()
        
        audio_bytes = response.content
        b64 = base64.b64encode(audio_bytes).decode('utf-8')
        print(f"   ✓ Audio generated ({len(b64)} chars)")
        return b64
        
    except requests.exceptions.HTTPError as e:
        print(f"   ❌ HTTP {e.response.status_code}")
        print(f"   Response: {e.response.text[:300]}")
        return "BASE64_PLACEHOLDER_AUDIO_FAILED"
    except Exception as e:
        print(f"   ❌ Audio failed: {e}")
        return "BASE64_PLACEHOLDER_AUDIO_FAILED"


def process_single_file(input_file: Path):
    """Process one audio tour JSON file"""
    if not input_file.exists():
        print(f"❌ File not found: {input_file}")
        return False

    processed_dir = input_file.parent / "processed"
    processed_dir.mkdir(exist_ok=True)

    output_file = processed_dir / input_file.name

    print(f"\n📂 Input : {input_file}")
    print(f"📂 Output: {output_file} (original untouched)")

    # ====================== ROBUST LOAD ======================
    raw = input_file.read_text(encoding="utf-8").strip()
    print(f"   Read {len(raw)} characters from file")

    if not raw:
        print("❌ File is empty!")
        return False

    try:
        data = json.loads(raw)
        print("✅ JSON parsed successfully")
    except json.JSONDecodeError as e:
        print(f"❌ JSON parse error: {e}")
        print("First 300 chars:")
        print(repr(raw[:300]))
        return False

    messages = data.get("messages", [])
    print(f"Found {len(messages)} messages. Generating Grok Eve audio...\n")

    for i, msg in enumerate(messages):
        text_to_speak = msg.get("dialog-text") or msg.get("text", "")
        if not text_to_speak:
            print(f"   ⚠️ Step {i} has no text — skipping audio")
            continue

        base64_audio = generate_grok_eve_audio(text_to_speak)
        msg["base64"] = base64_audio

    # ====================== SAVE PROCESSED COPY ======================
    data["generated_at"] = datetime.now().isoformat()
    data["voice"] = "eve"

    output_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n✅ COMPLETE!")
    print(f"   Original untouched: {input_file}")
    print(f"   Processed version with audio saved: {output_file}")
    return True


# ====================== MAIN ======================
if len(sys.argv) < 2:
    print("Usage:")
    print("  Single file:  python generate_tour_audio.py categories-widget-audiotour.json")
    print("  All files:    python generate_tour_audio.py *.json")
    print("  Pattern:      python generate_tour_audio.py '*-audiotour.json'")
    sys.exit(1)

pattern = sys.argv[1]

# Check if the argument looks like a wildcard/pattern
if "*" in pattern or "?" in pattern:
    # Batch mode - find all matching files
    files = sorted(Path(".").glob(pattern))
    
    if not files:
        print(f"❌ No files found matching pattern: {pattern}")
        sys.exit(1)

    print(f"🔍 Found {len(files)} file(s) matching pattern: {pattern}\n")
    
    success_count = 0
    for file_path in files:
        if process_single_file(file_path):
            success_count += 1
    
    print(f"\n{'='*60}")
    print(f"✅ Batch complete: {success_count}/{len(files)} files processed successfully")
    
else:
    # Single file mode
    input_file = Path(pattern)
    process_single_file(input_file)