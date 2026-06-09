from __future__ import annotations

import json
import re
import tempfile
from datetime import datetime, timedelta
from functools import lru_cache
from html import unescape
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

WORKSPACE_DIR = Path(__file__).resolve().parent
WORKBOOK_PATH = Path(r"C:\Users\samfo\Downloads\6401018 (1).xlsx")
ANREVIEW_STORAGE_DIR = Path(tempfile.gettempdir()) / "ANReview"
ANREVIEW_REVIEWS_PATH = ANREVIEW_STORAGE_DIR / "shared-reviews.json"
ANREVIEW_REPORTS_PATH = ANREVIEW_STORAGE_DIR / "review-reports.json"
ANREVIEW_CATALOG_CACHE_PATH = ANREVIEW_STORAGE_DIR / "catalog-cache.json"
HOST = "127.0.0.1"
PORT = 8000
CACHE_TTL = timedelta(hours=12)
CACHE_VERSION = 6
REQUEST_HEADERS = {
    "User-Agent": "ANRevU Local Sync/1.0 (+http://127.0.0.1:8000/cbe-rating/)",
}
DEFAULT_REVIEW_METRICS = ["Clarity", "Support", "Engagement"]

CBE_SCHOOL_SOURCES = [
    {
        "school": "Research School of Accounting",
        "schoolCode": "RSA",
        "url": "https://rsa.anu.edu.au/about/staff-directory",
    },
    {
        "school": "Research School of Economics",
        "schoolCode": "RSE",
        "url": "https://rse.anu.edu.au/about/people",
    },
    {
        "school": "Research School of Finance, Actuarial Studies and Statistics",
        "schoolCode": "RSFAS",
        "url": "http://rsfas.anu.edu.au/about/people",
    },
    {
        "school": "Research School of Management",
        "schoolCode": "RSM",
        "url": "https://rsm.anu.edu.au/about/people",
    },
]

COURSE_CATALOG_SOURCES = [
    "https://programsandcourses.anu.edu.au/program/allb",
    "https://programsandcourses.anu.edu.au/program/mjd",
    "https://programsandcourses.anu.edu.au/program/bfinn",
    "https://programsandcourses.anu.edu.au/major/ACMK-MAJ",
    "https://programsandcourses.anu.edu.au/major/CPMK-MAJ",
    "https://programsandcourses.anu.edu.au/major/QFIN-MAJ",
    "https://programsandcourses.anu.edu.au/program/bcomm",
    "https://programsandcourses.anu.edu.au/major/ACCT-MAJ",
    "https://programsandcourses.anu.edu.au/2025/major/BUSA-MAJ",
    "https://programsandcourses.anu.edu.au/major/BUSN-MAJ",
    "https://programsandcourses.anu.edu.au/major/CORP-MAJ",
    "https://programsandcourses.anu.edu.au/major/ECST-MAJ",
    "https://programsandcourses.anu.edu.au/major/FINM-MAJ",
    "https://programsandcourses.anu.edu.au/major/INTB-MAJ",
    "https://programsandcourses.anu.edu.au/major/MGMT-MAJ",
    "https://programsandcourses.anu.edu.au/major/MARK-MAJ",
]

LAW_CARD_RE = re.compile(
    r'<div class="bg-white staff">.*?<h3><a href="(?P<href>/about/our-people/[^"]+)"[^>]*>(?P<name>.*?)</a></h3>'
    r'<small class="text-gold">(?P<position>.*?)</small>'
    r'(?:<div class="research-interest"><p><small>(?P<focus>.*?)</small></p></div>)?',
    re.S,
)


def clean_label(description: str) -> str:
    parts = [part.strip() for part in description.split(";") if part.strip()]
    if len(parts) >= 2:
        return parts[1]
    return description.strip()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "series"


def read_json_file(path: Path, default: list[dict] | dict) -> list[dict] | dict:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def write_json_file(path: Path, payload: list[dict] | dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def ensure_anreview_storage() -> None:
    ANREVIEW_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    if not ANREVIEW_REVIEWS_PATH.exists():
        write_json_file(ANREVIEW_REVIEWS_PATH, [])
    if not ANREVIEW_REPORTS_PATH.exists():
        write_json_file(ANREVIEW_REPORTS_PATH, [])


def load_anreview_reviews() -> list[dict]:
    ensure_anreview_storage()
    return read_json_file(ANREVIEW_REVIEWS_PATH, [])


def load_anreview_reports() -> list[dict]:
    ensure_anreview_storage()
    return read_json_file(ANREVIEW_REPORTS_PATH, [])


def send_json(handler: SimpleHTTPRequestHandler, payload: dict | list, status: int = 200) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_request_json(handler: SimpleHTTPRequestHandler) -> dict:
    content_length = int(handler.headers.get("Content-Length", "0"))
    raw_body = handler.rfile.read(content_length) if content_length > 0 else b"{}"
    return json.loads(raw_body.decode("utf-8"))


def sanitize_text(value: str, max_length: int) -> str:
    return re.sub(r"\s+", " ", value).strip()[:max_length]


def build_review_record(payload: dict) -> dict:
    comment = sanitize_text(str(payload.get("comment", "")), 600)
    if len(comment) < 20:
        raise ValueError("Comment must be at least 20 characters long.")

    item_id = sanitize_text(str(payload.get("itemId", "")), 80)
    item_type = sanitize_text(str(payload.get("itemType", "")), 20)
    if not item_id or item_type not in {"course", "academic"}:
        raise ValueError("Review must include a valid item target.")

    tags = [
        sanitize_text(str(tag), 24)
        for tag in payload.get("tags", [])
        if sanitize_text(str(tag), 24)
    ][:5]

    ratings = {}
    for field in ("overall", "metricA", "metricB", "metricC"):
        value = int(payload.get(field, 0))
        if value < 1 or value > 5:
            raise ValueError("Ratings must be between 1 and 5.")
        ratings[field] = value

    return {
        "id": f"shared-{datetime.now().strftime('%Y%m%d%H%M%S%f')}",
        "itemId": item_id,
        "itemType": item_type,
        "author": sanitize_text(str(payload.get("author", "Anonymous")) or "Anonymous", 40),
        "createdAt": datetime.now().date().isoformat(),
        "overall": ratings["overall"],
        "metricA": ratings["metricA"],
        "metricB": ratings["metricB"],
        "metricC": ratings["metricC"],
        "tags": tags,
        "comment": comment,
    }


def build_report_record(payload: dict) -> dict:
    review_id = sanitize_text(str(payload.get("reviewId", "")), 80)
    item_id = sanitize_text(str(payload.get("itemId", "")), 80)
    if not review_id or not item_id:
        raise ValueError("Report must include reviewId and itemId.")

    reason = sanitize_text(str(payload.get("reason", "Needs moderator review")), 180)
    return {
        "id": f"report-{datetime.now().strftime('%Y%m%d%H%M%S%f')}",
        "reviewId": review_id,
        "itemId": item_id,
        "reason": reason or "Needs moderator review",
        "createdAt": datetime.now().isoformat(timespec="seconds"),
        "status": "open",
    }


@lru_cache(maxsize=1)
def load_dataset() -> dict:
    import pandas as pd

    data1 = pd.read_excel(WORKBOOK_PATH, sheet_name="Data1", header=None)
    index_sheet = pd.read_excel(WORKBOOK_PATH, sheet_name="Index", header=None)

    metadata_lookup: dict[str, dict[str, str]] = {}
    for row_idx in range(10, len(index_sheet)):
        description = index_sheet.iat[row_idx, 0]
        series_id = index_sheet.iat[row_idx, 4]
        start = index_sheet.iat[row_idx, 5]
        end = index_sheet.iat[row_idx, 6]
        unit = index_sheet.iat[row_idx, 8]
        data_type = index_sheet.iat[row_idx, 9]

        if pd.isna(description) or pd.isna(series_id):
            continue
        if unit != "Index Numbers" or data_type != "INDEX":
            continue

        metadata_lookup[str(series_id)] = {
            "description": str(description).strip(),
            "label": clean_label(str(description)),
            "start": pd.to_datetime(start).strftime("%Y-%m-%d"),
            "end": pd.to_datetime(end).strftime("%Y-%m-%d"),
        }

    periods = (
        pd.to_datetime(data1.iloc[10:, 0], errors="coerce")
        .dropna()
        .dt.strftime("%Y-%m-%d")
        .tolist()
    )

    series = []
    for col_idx in range(1, data1.shape[1]):
        series_id = data1.iat[9, col_idx]
        unit = data1.iat[1, col_idx]
        data_type = data1.iat[3, col_idx]

        if pd.isna(series_id) or unit != "Index Numbers" or data_type != "INDEX":
            continue

        series_id = str(series_id)
        metadata = metadata_lookup.get(series_id)
        if not metadata:
            continue

        values = pd.to_numeric(data1.iloc[10:, col_idx], errors="coerce")
        observations = [
            {"date": date, "value": round(float(value), 3)}
            for date, value in zip(periods, values.tolist())
            if pd.notna(value)
        ]

        if not observations:
            continue

        series.append(
            {
                "id": f"{slugify(metadata['label'])}-{series_id.lower()}",
                "seriesId": series_id,
                "label": metadata["label"],
                "description": metadata["description"],
                "start": metadata["start"],
                "end": metadata["end"],
                "observations": observations,
            }
        )

    series.sort(key=lambda item: item["label"].lower())
    return {
        "title": "ABS CPI Comparison Explorer",
        "source": "ABS 6401.0 Consumer Price Index, Australia - Table 18",
        "overallCpiSeriesId": "A2325846C",
        "series": series,
    }


def fetch_html(url: str) -> str:
    request = Request(url, headers=REQUEST_HEADERS)
    with urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8", errors="ignore")


def clean_html_text(value: str) -> str:
    text = value or ""
    for _ in range(4):
        decoded = unescape(text)
        if decoded == text:
            break
        text = decoded
    text = re.sub(r"(?i)&nbsp;|&#160;", " ", text)
    text = text.replace("\xa0", " ")
    text = re.sub(r"(?i)<br\s*/?>", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text).replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text.rstrip(";")


def shorten_course_summary(summary: str) -> str:
    cleaned = clean_html_text(summary)
    if not cleaned:
        return cleaned

    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", cleaned)
        if sentence.strip()
    ]
    if not sentences:
        return cleaned[:280].rstrip(" ,;") + ("." if len(cleaned) > 280 else "")

    chosen: list[str] = []
    total_chars = 0
    for sentence in sentences:
        chosen.append(sentence)
        total_chars += len(sentence)
        if len(chosen) >= 2 and total_chars >= 140:
            break
        if len(chosen) == 3:
            break

    compact = " ".join(chosen).strip()
    if len(compact) > 360:
        compact = compact[:357].rstrip(" ,;") + "..."
    return compact


def slug_from_url(url: str) -> str:
    return url.rstrip("/").split("/")[-1]


def build_tags(school_code: str, focus: str) -> list[str]:
    base = "law" if school_code == "LAW" else school_code.lower()
    tags = [base]
    for part in re.split(r",|/|\||\n", focus):
        cleaned = sanitize_text(part.lower(), 32)
        if cleaned and cleaned not in tags:
            tags.append(cleaned)
        if len(tags) == 4:
            break
    return tags


def build_academic_entry(
    *,
    school: str,
    school_code: str,
    name: str,
    position: str,
    focus: str,
    profile_url: str,
) -> dict:
    return {
        "id": slug_from_url(profile_url),
        "type": "academic",
        "name": name,
        "school": school,
        "schoolCode": school_code,
        "position": position,
        "focus": focus or school,
        "email": "See ANU profile",
        "office": school,
        "profileUrl": profile_url,
        "tags": build_tags(school_code, focus),
        "linkedCourses": [],
        "reviewMetrics": DEFAULT_REVIEW_METRICS,
    }


def build_school_code(school: str, college: str, code: str) -> str:
    if code:
        return code
    known_codes = {
        "Research School of Accounting": "RSA",
        "Research School of Economics": "RSE",
        "Research School of Finance, Actuarial Studies and Statistics": "RSFAS",
        "Research School of Management": "RSM",
        "ANU Law School": "LAW",
    }
    if school in known_codes:
        return known_codes[school]
    if "law" in school.lower() or "law" in college.lower():
        return "LAW"
    letters = [part[0] for part in re.findall(r"[A-Za-z]+", school)]
    return "".join(letters[:5]).upper() or "ANU"


def level_label_to_code(level: str) -> str:
    value = level.upper()
    if value in {"UGRD", "PGRD"}:
        return value
    return "PGRD" if "POST" in value or "GRAD" in value else "UGRD"


def build_course_entry(
    *,
    code: str,
    name: str,
    school: str,
    college: str,
    level: str,
    summary: str,
    handbook_url: str,
    terms: list[str],
    tags: list[str],
) -> dict:
    return {
        "id": code,
        "type": "course",
        "code": code,
        "name": name,
        "school": school or college or "ANU",
        "schoolCode": build_school_code(school or college or "ANU", college, ""),
        "level": level_label_to_code(level),
        "terms": terms or ["See ANU course page"],
        "conveners": [],
        "handbookUrl": handbook_url,
        "summary": shorten_course_summary(summary) or f"Official ANU course listing for {code}.",
        "tags": tags[:4] if tags else [code[:4].lower()],
        "reviewMetrics": ["Teaching quality", "Workload fairness", "Assessment design"],
    }


def extract_page_urls(start_url: str, html: str) -> list[str]:
    found = set()
    for href in re.findall(r'href="(\?page=[^"]+)"', html):
        found.add(urljoin(start_url, href))
    return sorted(found)


def crawl_paginated_pages(start_url: str, max_pages: int = 12) -> list[str]:
    seen: set[str] = set()
    queue = [start_url]
    pages: list[str] = []

    while queue and len(pages) < max_pages:
        current = queue.pop(0)
        if current in seen:
            continue
        seen.add(current)
        html = fetch_html(current)
        pages.append(html)
        for discovered in extract_page_urls(start_url, html):
            if discovered not in seen and discovered not in queue:
                queue.append(discovered)

    return pages


def parse_cbe_school_page(html: str, school: str, school_code: str, base_url: str) -> list[dict]:
    academics: list[dict] = []
    for segment in html.split('<div class="col-sm-12 col-lg-4 d-flex py-1">')[1:]:
        tag_match = re.search(r'<span class="tag-tint">(?P<tag>.*?)</span>', segment, re.S)
        tag = clean_html_text(tag_match.group("tag")) if tag_match else ""
        if tag != "Academic":
            continue

        name_match = re.search(r'<h3 class="fw-semibold mt-1">\s*(?P<name>.*?)\s*</h3>', segment, re.S)
        href_match = re.search(r'<a class="anu-button-black-filled" href="(?P<href>[^"]+)"', segment, re.S)
        if not name_match or not href_match:
            continue

        paragraphs = re.findall(r'<p class="d-flex gap-1">.*?<span>(.*?)</span></p>', segment, re.S)
        position = clean_html_text(paragraphs[0]) if paragraphs else "Academic"
        focus = clean_html_text(paragraphs[1]) if len(paragraphs) > 1 else ""
        profile_url = urljoin(base_url, href_match.group("href"))
        academics.append(
            build_academic_entry(
                school=school,
                school_code=school_code,
                name=clean_html_text(name_match.group("name")),
                position=position,
                focus=focus,
                profile_url=profile_url,
            )
        )
    return academics


def sync_cbe_academics() -> list[dict]:
    academics_by_id: dict[str, dict] = {}
    for source in CBE_SCHOOL_SOURCES:
        for html in crawl_paginated_pages(source["url"], max_pages=8):
            for academic in parse_cbe_school_page(
                html,
                school=source["school"],
                school_code=source["schoolCode"],
                base_url=source["url"],
            ):
                academics_by_id.setdefault(academic["id"], academic)
    return sorted(academics_by_id.values(), key=lambda item: (item["school"], item["name"]))


def is_law_academic_position(position: str) -> bool:
    text = position.lower()
    include_keywords = [
        "professor",
        "lecturer",
        "fellow",
        "dean",
        "reader",
        "chair",
        "associate dean",
        "director",
    ]
    exclude_keywords = [
        "candidate",
        "student",
        "manager",
        "officer",
        "assistant",
        "coordinator",
        "administrator",
        "services",
    ]
    return any(keyword in text for keyword in include_keywords) and not any(
        keyword in text for keyword in exclude_keywords
    )


def parse_law_page(html: str) -> list[dict]:
    academics: list[dict] = []
    for match in LAW_CARD_RE.finditer(html):
        position = clean_html_text(match.group("position"))
        if not is_law_academic_position(position):
            continue
        profile_url = urljoin("https://law.anu.edu.au/about/our-people", match.group("href"))
        focus = clean_html_text(match.group("focus") or "")
        academics.append(
            build_academic_entry(
                school="ANU Law School",
                school_code="LAW",
                name=clean_html_text(match.group("name")),
                position=position,
                focus=focus,
                profile_url=profile_url,
            )
        )
    return academics


def sync_law_academics() -> list[dict]:
    academics_by_id: dict[str, dict] = {}
    for html in crawl_paginated_pages("https://law.anu.edu.au/about/our-people", max_pages=18):
        for academic in parse_law_page(html):
            academics_by_id.setdefault(academic["id"], academic)
    return sorted(academics_by_id.values(), key=lambda item: item["name"])


def extract_course_codes_from_catalog_page(url: str) -> list[str]:
    html = fetch_html(url)
    codes = {
        match.group("code")
        for match in re.finditer(r"/(?:20\d{2}/)?course/(?P<code>[A-Z]{4}[0-9]{4})", html)
    }
    return sorted(codes)


def parse_course_page(code: str) -> dict | None:
    html = fetch_html(f"https://programsandcourses.anu.edu.au/course/{code}")

    name_match = re.search(r'<meta name="course-name" content="(?P<value>.*?)"', html, re.S)
    desc_match = re.search(r'<meta name="course-description" content="(?P<value>.*?)"', html, re.S)
    school_match = re.search(
        r'<p class="intro__degree-description__text">.*?<span class="first-owner">(?P<value>.*?)</span>',
        html,
        re.S,
    )
    college_match = re.search(
        r'<span class="degree-summary__code-heading"><i class="fa fa-group degree-summary__code-icon-group"></i>ANU College</span>\s*<span class="degree-summary__code-text">(?P<value>.*?)</span>',
        html,
        re.S,
    )
    level_match = re.search(
        r'<span class="degree-summary__code-heading"><i class="fa fa-book degree-summary__code-book-icon"></i>Academic career</span>\s*<span class="degree-summary__code-text">(?P<value>.*?)</span>',
        html,
        re.S,
    )
    tags_match = re.search(
        r'<span class="degree-summary__code-heading"><i class="fa fa-tag degree-summary__code-tag-icon"></i>Areas of interest</span>\s*<span class="degree-summary__code-text">(?P<value>.*?)</span>',
        html,
        re.S,
    )
    canonical_match = re.search(r'<link href="(?P<value>https://programsandcourses\.anu\.edu\.au/course/[^"]+)" rel="canonical"', html)

    if not name_match:
        return None

    terms = [
        clean_html_text(term)
        for term in re.findall(r'<h3>(First Semester|Second Semester|Summer Session|Autumn Session|Winter Session|Spring Session)</h3>', html)
    ]
    unique_terms = list(dict.fromkeys(terms))

    tags = []
    if tags_match:
        tags.extend(
            sanitize_text(part.lower(), 32)
            for part in re.split(r",|/|\||\n", clean_html_text(tags_match.group("value")))
            if sanitize_text(part.lower(), 32)
        )

    return build_course_entry(
        code=code,
        name=clean_html_text(name_match.group("value")),
        school=clean_html_text(school_match.group("value")) if school_match else "",
        college=clean_html_text(college_match.group("value")) if college_match else "",
        level=clean_html_text(level_match.group("value")) if level_match else "UGRD",
        summary=clean_html_text(desc_match.group("value")) if desc_match else "",
        handbook_url=canonical_match.group("value") if canonical_match else f"https://programsandcourses.anu.edu.au/course/{code}",
        terms=unique_terms,
        tags=tags,
    )


def sync_catalog_courses() -> list[dict]:
    codes: set[str] = set()
    for url in COURSE_CATALOG_SOURCES:
        codes.update(extract_course_codes_from_catalog_page(url))

    courses: list[dict] = []
    for code in sorted(codes):
        course = parse_course_page(code)
        if course:
            courses.append(course)
    return courses


def load_catalog_cache() -> dict | None:
    if not ANREVIEW_CATALOG_CACHE_PATH.exists():
        return None
    payload = read_json_file(ANREVIEW_CATALOG_CACHE_PATH, None)
    if not payload or not isinstance(payload, dict):
        return None
    if payload.get("version") != CACHE_VERSION:
        return None

    generated_at = payload.get("generatedAt")
    if not generated_at:
        return None

    try:
        generated = datetime.fromisoformat(generated_at)
    except ValueError:
        return None

    counts = payload.get("counts") or {}
    if datetime.now() - generated > CACHE_TTL:
        return None
    if counts.get("cbe", 0) <= 0 or counts.get("law", 0) <= 0 or counts.get("courses", 0) <= 0:
        return None
    return payload


def build_catalog_payload() -> dict:
    cached = load_catalog_cache()
    if cached:
        return cached

    cbe = sync_cbe_academics()
    law = sync_law_academics()
    courses = sync_catalog_courses()
    payload = {
        "version": CACHE_VERSION,
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "courses": courses,
        "academics": cbe + law,
        "counts": {
            "courses": len(courses),
            "cbe": len(cbe),
            "law": len(law),
            "total": len(cbe) + len(law),
        },
    }
    write_json_file(ANREVIEW_CATALOG_CACHE_PATH, payload)
    return payload


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WORKSPACE_DIR), **kwargs)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/data":
            send_json(self, load_dataset())
            return
        if parsed.path == "/api/anreview/reviews":
            send_json(
                self,
                {
                    "reviews": load_anreview_reviews(),
                    "reportCount": len(load_anreview_reports()),
                    "generatedAt": datetime.now().isoformat(timespec="seconds"),
                },
            )
            return
        if parsed.path == "/api/anreview/catalog":
            try:
                send_json(self, build_catalog_payload())
            except Exception as error:
                stale = read_json_file(ANREVIEW_CATALOG_CACHE_PATH, None)
                if stale and isinstance(stale, dict):
                    stale["warning"] = str(error)
                    send_json(self, stale)
                    return
                send_json(
                    self,
                    {
                        "courses": [],
                        "academics": [],
                        "counts": {"courses": 0, "cbe": 0, "law": 0, "total": 0},
                        "error": str(error),
                    },
                    status=503,
                )
            return
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            payload = read_request_json(self)
            if parsed.path == "/api/anreview/reviews":
                reviews = load_anreview_reviews()
                review = build_review_record(payload)
                reviews.insert(0, review)
                write_json_file(ANREVIEW_REVIEWS_PATH, reviews)
                send_json(self, {"ok": True, "review": review}, status=201)
                return

            if parsed.path == "/api/anreview/reports":
                reports = load_anreview_reports()
                report = build_report_record(payload)
                reports.insert(0, report)
                write_json_file(ANREVIEW_REPORTS_PATH, reports)
                send_json(self, {"ok": True, "report": report}, status=201)
                return

            send_json(self, {"ok": False, "error": "Not found."}, status=404)
        except ValueError as error:
            send_json(self, {"ok": False, "error": str(error)}, status=400)
        except json.JSONDecodeError:
            send_json(self, {"ok": False, "error": "Invalid JSON body."}, status=400)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    print(f"Serving on http://{HOST}:{PORT}/")
    server.serve_forever()
