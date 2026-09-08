"""Refresh the existing quarterly ABS series without changing their identities."""

import argparse
import copy
import hashlib
import json
import math
import re
from datetime import datetime
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/"
SOURCES = {
    "cpi": (BASE + "consumer-price-index-australia/latest-release", "6401018.xlsx"),
    "wpi": (BASE + "wage-price-index-australia/latest-release", "634501.xlsx"),
}


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.links.extend(value for key, value in attrs if key == "href" and value)


def download(url):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "www.abs.gov.au":
        raise ValueError("Only official ABS HTTPS downloads are accepted")
    with urlopen(Request(url, headers={"User-Agent": "CIS-Affordability-Index/1.0"}), timeout=90) as response:
        return response.read()


def latest_file(page, filename):
    parser = Links()
    parser.feed(download(page).decode("utf-8"))
    urls = {urljoin(page, link) for link in parser.links
            if urlparse(link).path.lower().endswith("/" + filename)}
    if len(urls) != 1:
        raise ValueError(f"Expected one ABS link for {filename}, found {len(urls)}")
    return urls.pop()


def read_bundle(path):
    result = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        name, payload = line.removesuffix(";").split(" = ", 1)
        result[name.removeprefix("window.")] = json.loads(payload)
    return result


def workbook_series(content, wanted):
    result = {}
    workbook = openpyxl.load_workbook(BytesIO(content), read_only=True, data_only=True)
    try:
        for sheet in workbook:
            if not sheet.title.startswith("Data"):
                continue
            rows = list(sheet.values)
            if len(rows) < 11:
                continue
            for column, series_id in enumerate(rows[9]):
                if series_id not in wanted:
                    continue
                if series_id in result:
                    raise ValueError(f"Duplicate series: {series_id}")
                if rows[1][column] != "Index Numbers" or rows[3][column] != "INDEX":
                    raise ValueError(f"Unexpected units/type for {series_id}")
                points = []
                for row in rows[10:]:
                    date, value = row[0], row[column]
                    if not isinstance(date, datetime) or value is None:
                        continue
                    if date.month not in (3, 6, 9, 12):
                        raise ValueError(f"Non-quarterly observation for {series_id}")
                    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
                        raise ValueError(f"Invalid index for {series_id}: {value}")
                    points.append({"date": date.strftime("%Y-%m-01"), "value": value})
                dates = [p["date"] for p in points]
                if not dates or dates != sorted(set(dates)):
                    raise ValueError(f"Empty, duplicate or unordered dates for {series_id}")
                result[series_id] = points
    finally:
        workbook.close()
    if set(result) != set(wanted):
        raise ValueError(f"Missing ABS series: {set(wanted) - set(result)}")
    return result


def preserve_history(old, new):
    if not {p["date"] for p in old}.issubset({p["date"] for p in new}):
        raise ValueError("Downloaded data removes existing quarters; keeping current bundle")


def rebuild(bundle, cpi, wpi):
    updated = copy.deepcopy(bundle)
    for series in updated["CPI_DATA"]["series"]:
        points = cpi[series["seriesId"]]
        preserve_history(series["observations"], points)
        series.update(observations=points, start=points[0]["date"], end=points[-1]["date"])
    points = wpi[bundle["WPI_METADATA"]["seriesId"]]
    preserve_history(bundle["WPI_DATA"], points)
    updated["WPI_DATA"] = points
    return updated


def shared_end(bundle):
    overall = next(s for s in bundle["CPI_DATA"]["series"]
                   if s["seriesId"] == bundle["CPI_DATA"]["overallCpiSeriesId"])
    return max({p["date"] for p in overall["observations"]} &
               {p["date"] for p in bundle["WPI_DATA"]})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Validate downloads without writing files")
    args = parser.parse_args()
    current = read_bundle(ROOT / "data.js")
    parsed, urls = {}, {}
    for kind, (page, filename) in SOURCES.items():
        urls[kind] = latest_file(page, filename)
        print(f"Downloading {kind.upper()}: {urls[kind]}")
        wanted = ([s["seriesId"] for s in current["CPI_DATA"]["series"]] if kind == "cpi"
                  else [current["WPI_METADATA"]["seriesId"]])
        parsed[kind] = workbook_series(download(urls[kind]), wanted)
    updated = rebuild(current, parsed["cpi"], parsed["wpi"])
    end = shared_end(updated)
    print(f"Latest shared quarter: {end}; previously {shared_end(current)}")
    if updated == current:
        print("No new quarters or revised observations. No data changes.")
        return
    if args.check:
        print("Validated new or revised data; check mode leaves files unchanged.")
        return
    payload = "".join(f"window.{key} = {json.dumps(value, separators=(',', ':'), ensure_ascii=False)};\n"
                      for key, value in updated.items())
    version = hashlib.sha256(payload.encode()).hexdigest()[:12]
    index_path = ROOT / "index.html"
    html = index_path.read_text(encoding="utf-8")
    html, count = re.subn(r'data\.js\?v=[^"\s]+', f"data.js?v={version}", html)
    if count != 1:
        raise ValueError("Could not update the data cache version")
    quarter = f"Q{int(end[5:7]) // 3} {end[:4]}"
    html, count = re.subn(r"Bundled data through Q[1-4] \d{4}\.", f"Bundled data through {quarter}.", html)
    if count != 1:
        raise ValueError("Could not update the methodology quarter")
    for kind, label in (("cpi", "CPI Table 18"), ("wpi", "WPI Table 1")):
        html, count = re.subn(r'<a href="[^"]+">' + label + r'</a>',
                              f'<a href="{urls[kind]}">{label}</a>', html)
        if count != 1:
            raise ValueError(f"Could not update {label} source link")
    # Both workbooks and page changes are validated before replacing any files.
    (ROOT / "data.js").write_text(payload, encoding="utf-8")
    index_path.write_text(html, encoding="utf-8")
    print("Updated data.js and index.html with complete ABS series.")


if __name__ == "__main__":
    main()
