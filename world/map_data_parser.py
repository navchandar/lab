"""Build map geometry and country metadata for the world map.

Requires:
    Python 3.10+
    requests

Outputs:
    map_data.json      Minified TopoJSON, approximately sorted north to south.
    country_data.json  Country metadata keyed by three-digit numeric code.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


# ---------- Configuration ----------

SCRIPT_DIR = (
    Path(__file__).resolve().parent if "__file__" in globals() else Path.cwd().resolve()
)

TOPO_URL = "https://cdn.jsdelivr.net/npm/visionscarto-world-atlas@1/world/50m.json"

COUNTRIES_URL = (
    "https://restcountries.com/v3.1/all"
    "?fields=ccn3,cca2,name,capital,region,languages,currencies"
)

FLAG_URL_TEMPLATE = "https://flagcdn.com/{alpha2}.svg"

MAP_FILENAME = "map_data.json"
COUNTRIES_FILENAME = "country_data.json"

# Requests connection timeout, read timeout).
API_TIMEOUT = (10, 200)
FLAG_TIMEOUT = (10, 15)

LOGGER = logging.getLogger(__name__)


# ---------- Exceptions and logging ----------
class DataUpdateError(RuntimeError):
    """A download, validation, or output error prevented a safe update."""


def configure_logging() -> None:
    """Configure logging when the script runs directly."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


# ---------- HTTP utilities ----------


def create_session() -> requests.Session:
    """Create a reusable HTTP session with bounded retry counts."""
    retry_policy = Retry(
        total=3,
        connect=3,
        read=3,
        status=3,
        backoff_factor=1,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        respect_retry_after_header=True,
        raise_on_status=False,
    )

    adapter = HTTPAdapter(max_retries=retry_policy)

    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update(
        {
            "User-Agent": "lab-world-map-data-updater/1.0",
        }
    )

    return session


def fetch_json_api(
    url: str,
    session: requests.Session,
    name: str,
    expected_type: type,
) -> Any:
    """Download JSON and validate its top-level structure."""
    LOGGER.info("Fetching %s data...", name)

    try:
        with session.get(url, timeout=API_TIMEOUT) as response:
            response.raise_for_status()

            try:
                data = response.json()
            except ValueError as exc:
                raise DataUpdateError(
                    f"{name} returned invalid JSON. "
                    f"Response preview: {response.text[:300]!r}"
                ) from exc

    except requests.exceptions.RequestException as exc:
        raise DataUpdateError(f"Failed to download {name} from {url}: {exc}") from exc

    if not isinstance(data, expected_type):
        preview = json.dumps(data, ensure_ascii=False)[:500]

        raise DataUpdateError(
            f"{name}: expected {expected_type.__name__}, "
            f"received {type(data).__name__}. "
            f"Response preview: {preview}"
        )

    if not data:
        raise DataUpdateError(f"{name} returned an empty response.")

    return data


def fetch_svg_flag(
    alpha2: str,
    session: requests.Session,
) -> str:
    """Download a flag, returning an empty string on failure."""
    url = FLAG_URL_TEMPLATE.format(alpha2=alpha2)

    try:
        with session.get(url, timeout=FLAG_TIMEOUT) as response:
            response.raise_for_status()
            svg = response.text

        # Basic sanity check, not an SVG security sanitizer.
        if "<svg" not in svg.lower():
            LOGGER.warning(
                "Flag response for '%s' did not contain SVG markup.",
                alpha2,
            )
            return ""

        return svg

    except requests.exceptions.RequestException as exc:
        LOGGER.warning(
            "Could not download flag for '%s': %s",
            alpha2,
            exc,
        )
        return ""


# ---------- Country metadata ----------


def optional_text(value: Any, field: str) -> str:
    """Normalize missing text while rejecting unexpected field types."""
    if value is None:
        return ""

    if not isinstance(value, str):
        raise DataUpdateError(
            f"{field}: expected a string, " f"received {type(value).__name__}."
        )

    return value.strip()


def normalize_numeric_code(value: Any) -> str | None:
    """Return a three-digit country code, or None for an unusable code."""
    if value is None:
        return None

    code = str(value).strip()

    if not code or not code.isascii() or not code.isdigit() or len(code) > 3:
        LOGGER.warning(
            "Skipping country with invalid ccn3: %r",
            value,
        )
        return None

    code = code.zfill(3)

    return None if code == "000" else code


def parse_country(
    country: dict[str, Any],
    code: str,
) -> dict[str, str]:
    """Validate the fields used by the frontend."""
    name_data = country.get("name")

    if name_data is None:
        name_data = {}

    if not isinstance(name_data, dict):
        raise DataUpdateError(f"Country {code}: 'name' must be an object.")

    name = optional_text(
        name_data.get("common"),
        f"Country {code} name.common",
    )

    capitals = country.get("capital")

    if capitals is None:
        capitals = []

    if not isinstance(capitals, list) or any(
        not isinstance(item, str) for item in capitals
    ):
        raise DataUpdateError(f"Country {code}: 'capital' must be a list of strings.")

    capital = capitals[0].strip() if capitals else ""

    region = optional_text(
        country.get("region"),
        f"Country {code} region",
    )

    alpha2 = optional_text(
        country.get("cca2"),
        f"Country {code} cca2",
    ).lower()

    if alpha2 and (len(alpha2) != 2 or not alpha2.isascii() or not alpha2.isalpha()):
        raise DataUpdateError(f"Country {code}: invalid two-letter code {alpha2!r}.")

    return {
        "name": name,
        "capital": capital,
        # Preserve the existing frontend field name.
        "continent": region,
        "alpha2": alpha2,
        "flag_svg": "",
    }


def build_country_details(
    countries: list[Any],
) -> dict[str, dict[str, str]]:
    """Validate country records and build metadata without fetching flags."""
    details: dict[str, dict[str, str]] = {}

    for index, country in enumerate(countries):
        if not isinstance(country, dict):
            raise DataUpdateError(
                f"RestCountries entry {index}: expected dict, "
                f"received {type(country).__name__}. "
                f"Value: {str(country)[:200]!r}"
            )

        code = normalize_numeric_code(country.get("ccn3"))

        if code is None:
            continue

        if code in details:
            raise DataUpdateError(f"Duplicate numeric country code: {code}.")

        details[code] = parse_country(country, code)

    if not details:
        raise DataUpdateError(
            "No usable country records were produced. "
            "Refusing to overwrite existing data."
        )

    LOGGER.info(
        "Built metadata for %d countries from %d input records.",
        len(details),
        len(countries),
    )

    return details


def download_country_flags(
    details: dict[str, dict[str, str]],
    session: requests.Session,
) -> None:
    """Populate flag SVGs without aborting on individual failures."""
    LOGGER.info("Downloading country flags...")

    downloaded = 0
    failed = 0
    missing_codes = 0

    for country in details.values():
        alpha2 = country["alpha2"]

        if not alpha2:
            missing_codes += 1
            continue

        svg = fetch_svg_flag(alpha2, session)
        country["flag_svg"] = svg

        if svg:
            downloaded += 1
        else:
            failed += 1

    LOGGER.info(
        "Flags: %d downloaded, %d failed, %d without alpha-2 codes.",
        downloaded,
        failed,
        missing_codes,
    )


# ---------- Map processing ----------


def get_country_geometries(
    topo_data: dict[str, Any],
) -> list[dict[str, Any]]:
    """Validate the required TopoJSON structure."""
    if topo_data.get("type") != "Topology":
        raise DataUpdateError("Map response is not a TopoJSON Topology.")

    objects = topo_data.get("objects")

    if not isinstance(objects, dict):
        raise DataUpdateError("TopoJSON is missing a valid 'objects' object.")

    countries = objects.get("countries")

    if not isinstance(countries, dict):
        raise DataUpdateError("TopoJSON is missing the 'countries' object.")

    geometries = countries.get("geometries")

    if not isinstance(geometries, list) or not geometries:
        raise DataUpdateError("TopoJSON country geometries must be a non-empty list.")

    for index, geometry in enumerate(geometries):
        if not isinstance(geometry, dict):
            raise DataUpdateError(f"Map geometry {index} must be an object.")

    if not isinstance(topo_data.get("arcs"), list):
        raise DataUpdateError("TopoJSON is missing a valid 'arcs' list.")

    return geometries


def get_avg_latitude(
    geometry: dict[str, Any],
    topo_data: dict[str, Any],
) -> float:
    """Estimate latitude from the first point of each exterior-ring arc.

    This preserves the original lightweight sorting approach.
    It is not a geographic centroid calculation.
    """
    try:
        transform = topo_data.get("transform")

        if transform is None:
            scale_y = 1
            translate_y = 0
        else:
            scale_y = transform["scale"][1]
            translate_y = transform["translate"][1]

        geometry_type = geometry.get("type")
        arcs = geometry.get("arcs", [])
        arc_indices = []

        if geometry_type == "Polygon":
            arc_indices = arcs[0] if arcs else []

        elif geometry_type == "MultiPolygon":
            for polygon in arcs:
                if polygon:
                    arc_indices.extend(polygon[0])

        latitudes = []

        for arc_index in arc_indices:
            # Negative TopoJSON arc references use bitwise complement.
            index = arc_index if arc_index >= 0 else ~arc_index
            first_point = topo_data["arcs"][index][0]

            latitude = first_point[1] * scale_y + translate_y
            latitudes.append(latitude)

        return sum(latitudes) / len(latitudes) if latitudes else 0.0

    except (KeyError, IndexError, TypeError, ValueError):
        LOGGER.debug(
            "Could not estimate latitude for geometry %r.",
            geometry.get("id"),
            exc_info=True,
        )
        return 0.0


def prepare_map(topo_data: dict[str, Any]) -> None:
    """Remove geometry properties and sort approximately north to south."""
    geometries = get_country_geometries(topo_data)

    LOGGER.info("Cleaning %d map geometries...", len(geometries))

    for geometry in geometries:
        # Preserve IDs, coordinates, arcs, and other geometry structure.
        geometry["properties"] = {}

    LOGGER.info("Sorting map geometries approximately north to south...")

    geometries.sort(
        key=lambda geometry: get_avg_latitude(geometry, topo_data),
        reverse=True,
    )


# ---------- Output ----------


def write_json(
    path: Path,
    data: Any,
    *,
    pretty: bool,
) -> None:
    """Write a JSON document to a staging file."""
    with path.open("w", encoding="utf-8") as output:
        options = {
            "allow_nan": False,
        }

        if pretty:
            options["indent"] = 2
        else:
            options["separators"] = (",", ":")

        json.dump(data, output, **options)


def save_outputs(
    topo_data: dict[str, Any],
    details: dict[str, dict[str, str]],
    output_dir: Path,
) -> tuple[Path, Path]:
    """Stage both documents before replacing the destination files.

    Each replacement is atomic on the same filesystem.
    The pair of replacements is not a single transaction.
    """
    sorted_details = dict(sorted(details.items(), key=lambda item: int(item[0])))

    map_path = output_dir / MAP_FILENAME
    details_path = output_dir / COUNTRIES_FILENAME

    try:
        # Stage within output_dir so replacements stay on one filesystem.
        with TemporaryDirectory(
            prefix=".world-data-",
            dir=output_dir,
        ) as temporary_dir:
            staging_dir = Path(temporary_dir)
            staged_map = staging_dir / MAP_FILENAME
            staged_details = staging_dir / COUNTRIES_FILENAME

            # Neither destination changes unless both serializations succeed.
            write_json(staged_map, topo_data, pretty=False)
            write_json(staged_details, sorted_details, pretty=True)

            os.replace(staged_map, map_path)
            os.replace(staged_details, details_path)

    except (OSError, TypeError, ValueError) as exc:
        raise DataUpdateError(
            f"Could not save output files in {output_dir}: {exc}. "
            "If replacement had already started, one destination "
            "may have been updated."
        ) from exc

    return map_path, details_path


# ---------- Orchestration ----------


def update_map_data() -> None:
    """Fetch, validate, process, and save both datasets."""
    LOGGER.info("Starting map data update process...")

    with create_session() as session:
        topo_data = fetch_json_api(
            TOPO_URL,
            session,
            "TopoJSON Map",
            expected_type=dict,
        )

        countries = fetch_json_api(
            COUNTRIES_URL,
            session,
            "RestCountries",
            expected_type=list,
        )

        # Validate and process both primary datasets before flag downloads.
        prepare_map(topo_data)
        details = build_country_details(countries)

        download_country_flags(details, session)

    map_path, details_path = save_outputs(
        topo_data,
        details,
        SCRIPT_DIR,
    )

    LOGGER.info(
        "Success! %s: %.1f KiB | %s: %.1f KiB",
        map_path.name,
        map_path.stat().st_size / 1024,
        details_path.name,
        details_path.stat().st_size / 1024,
    )


def main() -> int:
    """Return an exit code suitable for local runs and GitHub Actions."""
    configure_logging()

    try:
        update_map_data()
        return 0

    except DataUpdateError:
        LOGGER.exception("ABORT: Map data update failed.")
        return 1

    except KeyboardInterrupt:
        LOGGER.warning("Map data update interrupted.")
        return 130

    except Exception:
        # Final CLI boundary: unexpected bugs must fail the workflow
        LOGGER.exception("ABORT: Unexpected map data update failure.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
