import utils

# --- CONFIGURATION ---
DATA_DIR = utils.get_data_folder()
# The final output file name
OUTPUT_FILENAME = "availability.json"
FINAL_OUTPUT = DATA_DIR / OUTPUT_FILENAME


def main():
    print("--- Starting Merge Process ---")

    # Master dictionary: PIN -> Data Object
    merged_map = {}

    # --- Load the existing data file first (Preserve History) ---
    if FINAL_OUTPUT.exists():
        print(f"Loading existing master file: {OUTPUT_FILENAME}")
        existing_data = utils.load_json(FINAL_OUTPUT)
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
        data = utils.load_json(filepath)

        if not data:
            continue

        # Sort and save the input file itself before merging
        utils.sort_and_save_json(filepath, data)

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
    utils.sort_and_save_json(FINAL_OUTPUT, final_list)

    print("Merge Process Complete.")


if __name__ == "__main__":
    main()
