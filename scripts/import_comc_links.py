"""Import COMC (or other) hotlinked image URLs into a small overrides JSON.

Why:
  - cards.json is auto-generated from Excel (don't edit it by hand).
  - We hotlink COMC images instead of downloading/rehosting.

Workflow:
  1) Update cards.json:
       py scripts/export_from_excel.py
  2) Generate a "needed" TSV for owned cards missing COMC links:
       py scripts/import_comc_links.py --export-needed
  3) Copy rows you want and fill in COMC urls in:
       incoming-images/comc_links.tsv
     Columns you fill:
       - comcPageUrl: the COMC item page URL
       - comcImgUrl:  right-click the image on COMC -> Copy image address
  4) Import/merge into site/data/image_overrides.json:
       py scripts/import_comc_links.py

TSV columns (tab-delimited):
  cardKey   comcPageUrl   comcImgUrl   credit

Notes:
  - credit is optional (defaults to "COMC.com")
  - Lines starting with # are ignored.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CARDS_JSON = ROOT / "site" / "data" / "cards.json"
OVERRIDES_JSON = ROOT / "site" / "data" / "image_overrides.json"

INBOX_DIR = ROOT / "incoming-images"
# Your curated file (you edit this one):
TSV_IMPORT = INBOX_DIR / "comc_links.tsv"
# Auto-generated helper file (safe to overwrite):
TSV_NEEDED = INBOX_DIR / "comc_links_needed.tsv"


def load_json(path: Path, default):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def export_needed(cards: list[dict], overrides: dict) -> None:
    """Create a TSV the user can fill with COMC URLs."""
    INBOX_DIR.mkdir(parents=True, exist_ok=True)

    def has_override(c: dict) -> bool:
        ck = str(c.get("cardKey", "")).strip()
        cid = str(c.get("id", "")).strip()
        return (ck and ck in overrides) or (cid and cid in overrides)

    rows = []
    for c in cards:
        if int(c.get("owned", 0) or 0) != 1:
            continue
        if has_override(c):
            continue
        rows.append(
            {
                "cardKey": str(c.get("cardKey", "")).strip(),
                "comcPageUrl": "",
                "comcImgUrl": "",
                "credit": "COMC.com",
                # Helpful context columns (not used by importer)
                "id": str(c.get("id", "")).strip(),
                "cardNo": str(c.get("cardNo", "")).strip(),
                "variant": str(c.get("variant", "")).strip(),
                "set": str(c.get("set", "")).strip(),
                "name": str(c.get("name", "")).strip(),
            }
        )

    with TSV_NEEDED.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(["cardKey", "comcPageUrl", "comcImgUrl", "credit", "id", "cardNo", "variant", "set", "name"])
        for r in rows:
            w.writerow([r["cardKey"], r["comcPageUrl"], r["comcImgUrl"], r["credit"], r["id"], r["cardNo"], r["variant"], r["set"], r["name"]])

    print(f"Wrote {len(rows)} rows to {TSV_NEEDED}")


def import_links(cards: list[dict], overrides: dict, tsv_path: Path) -> None:
    cardkeys = {str(c.get("cardKey", "")).strip(): c for c in cards if str(c.get("cardKey", "")).strip()}
    ids = {str(c.get("id", "")).strip(): c for c in cards if str(c.get("id", "")).strip()}

    if not tsv_path.exists():
        raise SystemExit(f"TSV not found: {tsv_path}\nRun: py scripts/import_comc_links.py --export-needed")

    with tsv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader((ln for ln in f if ln.strip() and not ln.lstrip().startswith("#")), delimiter="\t")
        expected = {"cardKey", "comcPageUrl", "comcImgUrl"}
        if not reader.fieldnames or not expected.issubset(set(reader.fieldnames)):
            raise SystemExit(
                "TSV header missing/invalid. Expected columns: cardKey, comcPageUrl, comcImgUrl, credit\n"
                "Tip: regenerate a correct template with --export-needed"
            )

        updated = 0
        skipped = 0
        for row in reader:
            ck = (row.get("cardKey") or "").strip()
            page = (row.get("comcPageUrl") or "").strip()
            img = (row.get("comcImgUrl") or "").strip()
            credit = (row.get("credit") or "").strip() or "COMC.com"

            if not ck or not img:
                skipped += 1
                continue

            card = cardkeys.get(ck)
            if not card:
                # allow pasting id into the cardKey column
                card = ids.get(ck)
                if card:
                    ck = str(card.get("cardKey", "")).strip() or ck
                else:
                    print(f"WARN: unknown cardKey (not in cards.json): {ck}")
                    skipped += 1
                    continue

            overrides[ck] = {"src": img, "href": page or img, "credit": credit}
            updated += 1

    write_json(OVERRIDES_JSON, overrides)
    print(f"Updated {updated} overrides (skipped {skipped}).")
    print(f"Wrote: {OVERRIDES_JSON}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cards", default=str(CARDS_JSON), help="Path to cards.json")
    ap.add_argument("--overrides", default=str(OVERRIDES_JSON), help="Output overrides JSON")
    ap.add_argument("--tsv", default=str(TSV_IMPORT), help="Input TSV (tab-delimited)")
    ap.add_argument("--export-needed", action="store_true", help="Export a TSV of owned cards missing overrides")
    args = ap.parse_args()

    cards_path = Path(args.cards)
    overrides_path = Path(args.overrides)
    tsv_path = Path(args.tsv)

    if not cards_path.exists():
        raise SystemExit(f"cards.json not found: {cards_path}\nRun: py scripts/export_from_excel.py")

    cards = load_json(cards_path, [])
    overrides = load_json(overrides_path, {})
    if not isinstance(overrides, dict):
        overrides = {}

    if args.export_needed:
        export_needed(cards, overrides)
        return

    import_links(cards, overrides, tsv_path)


if __name__ == "__main__":
    main()
