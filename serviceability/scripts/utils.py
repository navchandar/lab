import json
import os
import time
from pathlib import Path

SAVE_INTERVAL = 10


def get_data_folder() -> Path:
    """Returns serviceability/data folder path"""
    SCRIPT_DIR = (
        Path(__file__).resolve().parent
        if "__file__" in globals()
        else Path(Path.cwd() / "scripts").resolve()
    )
    PROJECT_ROOT = SCRIPT_DIR.parent
    DATA_DIR = PROJECT_ROOT / "data"
    if not DATA_DIR.exists():
        DATA_DIR.mkdir(parents=True)

    return DATA_DIR


def delete_old_data(file_path) -> None:
    # Delete older file to refresh new data
    if file_path.exists():
        seconds_in_month = 30 * 24 * 60 * 60
        # Check if (Current Time - File Time) is greater than 30 days
        if (time.time() - file_path.stat().st_mtime) > seconds_in_month:
            file_path.unlink()
            print(f"Removed outdated file: {file_path}")


# --- FILE OPERATIONS ---
def load_json(file_path):
    if not os.path.exists(file_path):
        print(f"{file_path=} does not exist!")
        return []
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Could not read {file_path}: {e}")
        return []


def save_json(file_path, data):
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print(f"Saved {file_path}")
    except Exception as e:
        print(f"Failed to save {file_path}:\n{e}")


def sort_and_save_json(file_path: Path, data_list: list):
    """
    Sorts the list by 'pin' and saves it to the specified filepath.
    Reusable for both input files and the final merged file.
    """
    if not data_list:
        print("No data to save in json!")
        return

    # Sort the list in-place by the 'pin' key
    try:
        # Try numeric sort first
        data_list.sort(
            key=lambda x: int(x["pin"]) if str(x["pin"]).isdigit() else x["pin"]
        )
    except Exception as e:
        print(
            f"Failed to sort {file_path.name} numerically, falling back to string sort. ({e})"
        )
        data_list.sort(key=lambda x: x["pin"])
    # Save to disk
    save_json(file_path, data_list)

