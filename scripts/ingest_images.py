#!/usr/bin/env python3
"""
Ingest card images dropped into an inbox folder and rename/move them into the
exact filename your site expects.

Default inbox:  incoming-images/
Default output: site/images/<id>.jpg   (unique, collision-proof)

Filename formats supported (case-insensitive; spaces/underscores/dashes OK):

  1) "<cardNo> <variant>.jpg"
     Example: "C-11 Black.jpg"

  2) "<cardNo> <variant> @ <set or group or cardKey>.jpg"  (use this if ambiguous)
     Example: "1 Base @ Base Set - Season 1.jpg"

  3) "<cardKey>.jpg"  (the full internal key with pipes)
     Example: "Characters|Characters Black Parallel|C-11|Black.jpg"

Extras after the variant (like serial numbers "09-25") are allowed:
  "C-11 Black 09-25.jpg" -> still matches variant "Black"

Run from repo root:
  py scripts/ingest_images.py
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def slugify(s: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", str(s).lower())).strip("-")


def safe_cardno(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9-]", "", str(s))


def norm_spaces(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("_", " ")).strip()


@dataclass
class MatchResult:
    ok: bool
    card: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    suggestions: Optional[List[str]] = None


def load_cards(cards_path: Path) -> List[Dict[str, Any]]:
    with cards_path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"{cards_path} did not contain a JSON array.")
    return data


def build_indexes(cards: List[Dict[str, Any]]) -> Tuple[List[str], List[str]]:
    cardnos = sorted(
        {str(c.get("cardNo", "")).strip() for c in cards if str(c.get("cardNo", "")).strip()},
        key=len,
        reverse=True,
    )
    variants = sorted(
        {str(c.get("variant", "")).strip() for c in cards if str(c.get("variant", "")).strip()},
        key=len,
        reverse=True,
    )
    return cardnos, variants


def pick_variant_slug(raw_variant: str, known_variants: List[str]) -> str:
    """
    Turns user input like:
      "printing plate inscribed 1/1" -> "printing-plate-inscribed"
      "Black 09-25" -> "black"
    by picking the *longest* known variant slug that is a prefix of the input slug.
    """
    raw_slug = slugify(raw_variant)
    if not raw_slug:
        return "base"

    variant_slugs = [(slugify(v), v) for v in known_variants]
    variant_slugs.sort(key=lambda x: len(x[0]), reverse=True)

    for vslug, _ in variant_slugs:
        if not vslug:
            continue
        if raw_slug == vslug:
            return vslug
        if raw_slug.startswith(vslug + "-"):
            return vslug
        if raw_slug.startswith(vslug) and len(vslug) >= 4:
            return vslug

    return raw_slug


def parse_target_from_stem(
    stem: str, known_cardnos: List[str]
) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    """
    Returns (cardNo, rawVariant, hint, rawCardKeyIfProvided)
    """
    s = norm_spaces(stem)

    # If user gave the full cardKey, it's unambiguous and easiest.
    if "|" in s and s.count("|") >= 2:
        return None, None, None, s

    # Try to match a known cardNo as a prefix (best accuracy).
    s_upper = s.upper()
    for cn in known_cardnos:
        cn_upper = cn.upper()
        if s_upper == cn_upper:
            rest = ""
            cardno = cn
            break
        if s_upper.startswith(cn_upper):
            rest = s[len(cn) :]
            if rest == "":
                cardno = cn
                break
            if rest[0] in (" ", "-", "–", "—", "_"):
                cardno = cn
                break
    else:
        # Fallback: first token is cardNo, rest is variant
        parts = s.split(" ", 1)
        cardno = parts[0] if parts else ""
        rest = parts[1] if len(parts) > 1 else ""

    rest = rest.strip(" _-–—").strip()
    hint = None
    if "@" in rest:
        left, right = rest.split("@", 1)
        rest = left.strip()
        hint = right.strip()

    raw_variant = rest if rest else "Base"
    return cardno, raw_variant, hint, None


def match_card(cards: List[Dict[str, Any]], cardno: str, variant_slug: str, hint: Optional[str]) -> MatchResult:
    cardno_norm = safe_cardno(cardno).upper()

    candidates = [
        c
        for c in cards
        if safe_cardno(c.get("cardNo", "")).upper() == cardno_norm
        and slugify(c.get("variant", "")) == variant_slug
    ]

    if hint:
        hint_norm = hint.strip().lower()
        hint_slug = slugify(hint)

        def hits(c: Dict[str, Any]) -> bool:
            ck = str(c.get("cardKey", "")).lower()
            if hint_norm == ck or hint_norm in ck:
                return True
            return (
                hint_slug in slugify(c.get("set", ""))
                or hint_slug in slugify(c.get("group", ""))
                or hint_slug in slugify(c.get("cardKey", ""))
            )

        candidates = [c for c in candidates if hits(c)]

    if len(candidates) == 1:
        return MatchResult(ok=True, card=candidates[0])

    if len(candidates) == 0:
        same_no = [c for c in cards if safe_cardno(c.get("cardNo", "")).upper() == cardno_norm]
        sugg: List[str] = []
        if same_no:
            for c in sorted(same_no, key=lambda x: (str(x.get("variant", "")), str(x.get("set", "")))):
                sugg.append(f'{c.get("cardNo")} {c.get("variant")} @ {c.get("set")}   (id {c.get("id")})')
            msg = f'No match for cardNo="{cardno}" variant="{variant_slug}". That cardNo exists, but with different variants/sets.'
        else:
            msg = f'No match for cardNo="{cardno}" variant="{variant_slug}".'
        return MatchResult(ok=False, error=msg, suggestions=sugg[:20])

    sugg = []
    for c in sorted(candidates, key=lambda x: (str(x.get("set", "")), str(x.get("name", "")))):
        sugg.append(f'{c.get("cardNo")} {c.get("variant")} @ {c.get("set")}   (id {c.get("id")})')
    msg = f'Ambiguous: cardNo="{cardno}" variant="{variant_slug}" matched {len(candidates)} cards. Add "@ <set>" to the filename to disambiguate.'
    return MatchResult(ok=False, error=msg, suggestions=sugg[:20])


def match_by_cardkey(cards: List[Dict[str, Any]], cardkey: str) -> MatchResult:
    key_norm = cardkey.strip().lower()
    candidates = [c for c in cards if str(c.get("cardKey", "")).strip().lower() == key_norm]
    if len(candidates) == 1:
        return MatchResult(ok=True, card=candidates[0])
    if len(candidates) == 0:
        return MatchResult(ok=False, error=f'No card with cardKey="{cardkey}".')
    return MatchResult(ok=False, error=f'Ambiguous cardKey="{cardkey}" matched {len(candidates)} cards (unexpected).')


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Ingest card images from a simple naming convention into the site's expected filenames.")
    ap.add_argument("--inbox", default="incoming-images", help="Folder to scan for incoming images.")
    ap.add_argument("--cards", default="site/data/cards.json", help="Path to cards.json.")
    ap.add_argument("--out", default="site/images", help="Output folder for final images (<id>.jpg).")
    ap.add_argument("--action", choices=["move", "copy"], default="move", help="Move (default) or copy images out of inbox.")
    ap.add_argument("--overwrite", action="store_true", help="Overwrite existing destination files.")
    ap.add_argument("--dry-run", action="store_true", help="Print what would happen without moving/copying.")
    args = ap.parse_args(argv)

    inbox = Path(args.inbox)
    cards_path = Path(args.cards)
    out_dir = Path(args.out)

    if not cards_path.exists():
        print(f"ERROR: cards.json not found at {cards_path}", file=sys.stderr)
        return 2

    cards = load_cards(cards_path)
    known_cardnos, known_variants = build_indexes(cards)

    if not inbox.exists():
        print(f"Nothing to do: inbox folder does not exist: {inbox}")
        return 0

    files = [p for p in inbox.iterdir() if p.is_file() and p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")]
    if not files:
        print(f"Nothing to do: no image files found in {inbox}")
        return 0

    out_dir.mkdir(parents=True, exist_ok=True)

    ok_count = 0
    fail_count = 0

    for src in sorted(files, key=lambda p: p.name.lower()):
        if src.suffix.lower() not in (".jpg", ".jpeg"):
            print(f"SKIP: {src.name} (only .jpg/.jpeg supported right now)")
            continue

        stem = src.stem
        cardno, raw_variant, hint, raw_cardkey = parse_target_from_stem(stem, known_cardnos)

        if raw_cardkey:
            mr = match_by_cardkey(cards, raw_cardkey)
        else:
            variant_slug = pick_variant_slug(raw_variant, known_variants)
            mr = match_card(cards, cardno or "", variant_slug, hint)

        if not mr.ok or not mr.card:
            fail_count += 1
            print(f"\nERROR: {src.name}")
            print("  " + (mr.error or "Unknown error"))
            if mr.suggestions:
                print("  Suggestions:")
                for s in mr.suggestions:
                    print("   - " + s)
            continue

        card = mr.card
        dest = out_dir / f"{card['id']}.jpg"

        label = f"{card.get('group')} • {card.get('set')} • {card.get('cardNo')} • {card.get('variant')} • {card.get('name')}"
        if dest.exists() and not args.overwrite:
            print(f"SKIP: {src.name} -> {dest} (already exists) [{label}]")
            continue

        print(f"OK:   {src.name} -> {dest.name} [{label}]")

        if args.dry_run:
            ok_count += 1
            continue

        if args.action == "copy":
            shutil.copy2(src, dest)
        else:
            shutil.move(src, dest)

        ok_count += 1

    print(f"\nDone. Imported: {ok_count}. Failed: {fail_count}.")
    return 1 if fail_count else 0


if __name__ == "__main__":
    raise SystemExit(main())
