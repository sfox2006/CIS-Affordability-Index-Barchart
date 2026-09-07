"""Compare the bundled series with downloaded ABS time-series workbooks."""

import json
import sys
from datetime import datetime
from pathlib import Path

import openpyxl


def workbook_series(path):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    result = {}
    for sheet in workbook:
        if not sheet.title.startswith("Data"):
            continue
        rows = list(sheet.values)
        for column, series_id in enumerate(rows[9]):
            if not isinstance(series_id, str) or not series_id.startswith("A"):
                continue
            result[series_id] = {
                row[0].strftime("%Y-%m-01"): row[column]
                for row in rows[10:]
                if isinstance(row[0], datetime)
                and isinstance(row[column], (float, int))
            }
    workbook.close()
    return result


def main():
    bundle = {}
    for line in (Path(__file__).resolve().parents[1] / "data.js").read_text(encoding="utf-8-sig").splitlines():
        name, payload = line.removesuffix(";").split(" = ", 1)
        bundle[name.removeprefix("window.")] = json.loads(payload)
    cpi = workbook_series(sys.argv[1])
    wpi = workbook_series(sys.argv[2])
    mismatches = []
    counts = {"CPI": 0, "WPI": 0}
    series = [("CPI", s["seriesId"], s["observations"], cpi) for s in bundle["CPI_DATA"]["series"]]
    series.append(("WPI", bundle["WPI_METADATA"]["seriesId"], bundle["WPI_DATA"], wpi))
    for kind, series_id, points, source in series:
        for point in points:
            expected = source.get(series_id, {}).get(point["date"])
            if expected is None or abs(expected - point["value"]) > 1e-8:
                mismatches.append((series_id, point, expected))
            counts[kind] += 1
    print(json.dumps({"checked": counts, "mismatchCount": len(mismatches), "examples": mismatches[:10]}, indent=2))
    print("ABS WPI final quarters:", sorted(wpi[bundle["WPI_METADATA"]["seriesId"]].items())[-5:])
    assert not mismatches, "Bundled observations differ from ABS workbooks"


if __name__ == "__main__":
    main()
