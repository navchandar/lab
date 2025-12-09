import json
from pathlib import Path

# --- CONFIGURATION ---
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"

# The final output file name
OUTPUT_FILENAME = "availability.json"
FINAL_OUTPUT = DATA_DIR / OUTPUT_FILENAME


def load_json(filepath):
    if not filepath.exists():
        return []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading {filepath.name}: {e}")
        return []


def main():
    print("--- Starting Merge Process ---")

    # 1. Dynamically find files
    # pattern: starts with "availability_", ends with ".json"
    candidates = list(DATA_DIR.glob("availability_*.json"))

    # 2. Filter out the final output file (availability.json)
    # We don't want to merge the output into itself!
    files_to_merge = [f for f in candidates if f.name != OUTPUT_FILENAME]

    if not files_to_merge:
        print("No 'availability_*.json' files found to merge.")
        return

    print(f"Found {len(files_to_merge)} files to merge:")
    for f in files_to_merge:
        print(f"  - {f.name}")

    # 3. Master dictionary: PIN -> Data Object
    merged_map = {}

    for filepath in files_to_merge:
        data = load_json(filepath)

        for entry in data:
            pin = entry.get("pin")
            if not pin:
                continue

            # If pin not in master map, add it
            if pin not in merged_map:
                merged_map[pin] = {"pin": pin, "partners": {}}

            # Merge partners
            # This logic preserves existing partners and adds/updates new ones
            new_partners = entry.get("partners", {})
            merged_map[pin]["partners"].update(new_partners)

    # 4. Convert map back to list
    final_list = list(merged_map.values())

    # 5. Save
    try:
        with open(FINAL_OUTPUT, "w", encoding="utf-8") as f:
            json.dump(final_list, f, indent=2)

        print(
            f"\n✅ Successfully merged {len(final_list)} locations into {OUTPUT_FILENAME}"
        )
    except Exception as e:
        print(f"❌ Failed to save output: {e}")


if __name__ == "__main__":
    main()
