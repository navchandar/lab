import json
from pathlib import Path

# --- CONFIGURATION ---
SCRIPT_DIR = (
    Path(__file__).resolve().parent
    if "__file__" in globals()
    else Path(Path.cwd() / "scripts").resolve()
)
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"

# The final output file name
OUTPUT_FILENAME = "availability.json"
FINAL_OUTPUT = DATA_DIR / OUTPUT_FILENAME


def load_json(filepath) -> list:
    """Reads a JSON file and returns a list."""
    if not filepath.exists():
        return []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading {filepath.name}: {e}")
    return []


def sort_and_save_json(filepath: Path, data_list: list):
    """
    Sorts the list by 'pin' and saves it to the specified filepath.
    Reusable for both input files and the final merged file.
    """
    if not data_list:
        return

    # 1. Sort the list in-place by the 'pin' key
    try:
        # Try numeric sort first
        data_list.sort(key=lambda x: int(x["pin"]) if str(x["pin"]).isdigit() else x["pin"])
    except Exception as e:
        print(f"Failed to sort {filepath.name} numerically, falling back to string sort. ({e})")
        data_list.sort(key=lambda x: x["pin"])

    # 2. Save to disk
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data_list, f, indent=2)
        print(f"Saved: {filepath.name}")
    except Exception as e:
        print(f"Failed to save {filepath.name}: {e}")


def main():
    print("--- Starting Merge Process ---")

    # Master dictionary: PIN -> Data Object
    merged_map = {}

    # --- Load the existing data file first (Preserve History) ---
    if FINAL_OUTPUT.exists():
        print(f"Loading existing master file: {OUTPUT_FILENAME}")
        existing_data = load_json(FINAL_OUTPUT)
        for entry in existing_data:
            pin = entry.get("pin")
            if pin:
                merged_map[pin] = entry
    else:
        print(f"No existing {OUTPUT_FILENAME} found. Creating new.")

    # --- Find and Merge new partial files ---
    # pattern: starts with "availability_", ends with ".json"
    candidates = list(DATA_DIR.glob("availability_*.json"))

    # Filter out the final output file so we don't merge it into itself again
    files_to_merge = [f for f in candidates if f.name != OUTPUT_FILENAME]

    if not files_to_merge:
        print("No new 'availability_*.json' files found to merge.")
    else:
        print(f"Found {len(files_to_merge)} files to process:")

    # --- Process each input file ---
    for filepath in files_to_merge:
        data = load_json(filepath)

        if not data:
            continue

        # Sort and save the input file itself before merging
        sort_and_save_json(filepath, data)

        # Merge Logic
        for entry in data:
            pin = entry.get("pin")
            if not pin:
                continue

            # If pin not in master map, create it
            if pin not in merged_map:
                merged_map[pin] = {"pin": pin, "partners": {}}

            # Merge partners without removing existing ones
            new_partners = entry.get("partners", {})
            merged_map[pin]["partners"].update(new_partners)

    # --- Convert map back to list ---
    final_list = list(merged_map.values())

    # --- Final Sort and Save ---
    print(f"--- Saving Merged File ({len(final_list)} records) ---")
    sort_and_save_json(FINAL_OUTPUT, final_list)

    print("Merge Process Complete.")


if __name__ == "__main__":
    main()
