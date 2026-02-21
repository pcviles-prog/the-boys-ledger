"""Export the 'Data' sheet from your Excel workbook to the JSON file the site reads.

Usage:
  python scripts/export_from_excel.py

Edit EXCEL_PATH if you rename / move the spreadsheet.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import pandas as pd


EXCEL_PATH = Path(__file__).resolve().parents[1] / "2025_Upper_Deck_Skybox_The_Boys_Master_Checklist_points_rework_v14.xlsx"
OUT_JSON = Path(__file__).resolve().parents[1] / "site" / "data" / "cards.json"


def short_id(cardkey: str) -> str:
    return hashlib.sha1(cardkey.encode("utf-8")).hexdigest()[:12]


def to_int_or_none(x):
    if pd.isna(x):
        return None
    try:
        return int(float(x))
    except Exception:
        return None


def main() -> None:
    if not EXCEL_PATH.exists():
        raise SystemExit(f"Excel file not found: {EXCEL_PATH}")

    df = pd.read_excel(EXCEL_PATH, sheet_name="Data")

    export_cols = {
        "Group": "group",
        "Set Name": "set",
        "Card #": "cardNo",
        "Card Name": "name",
        "Parallel/Variant": "variant",
        "Print Run": "printRun",
        "IsPlate": "isPlate",
        "IncludedInChase": "inChase",
        "Category": "category",
        "PointsWeight": "pointsWeight",
        "Owned": "owned",
        "Incoming": "incoming",
        "Missing": "missing",
        "Inscription Variant": "inscription",
    }

    cards = []
    for i, row in df.iterrows():
        ck = str(row.get("CardKey", ""))
        cid = short_id(ck) if ck else short_id(f"row{i}")
        card = {"id": cid, "cardKey": ck}

        for col, out in export_cols.items():
            val = row.get(col, None)
            if col == "Print Run":
                val = to_int_or_none(val)
            elif col in ["Owned", "Incoming", "Missing"]:
                if pd.isna(val):
                    val = 0
                try:
                    val = int(val)
                except Exception:
                    val = 1 if str(val).strip().lower() in ["y", "yes", "true", "1"] else 0
            elif col == "PointsWeight":
                if pd.isna(val):
                    val = 0
                try:
                    val = float(val)
                    if abs(val - round(val)) < 1e-9:
                        val = int(round(val))
                except Exception:
                    val = 0
            else:
                if pd.isna(val):
                    val = ""
                else:
                    val = str(val)
            card[out] = val

        card["image"] = f"images/{cid}.jpg"
        cards.append(card)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(cards, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(cards)} cards to {OUT_JSON}")


if __name__ == "__main__":
    main()
