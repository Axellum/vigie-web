#!/usr/bin/env python3
"""Copies the weather icons of the Vigie family into the app, from the Home Assistant card of vigie-api.

The card (``custom_components/vigie/frontend/vigie-card.js`` of vigie-api, drawn by its ``scripts/card_icons.py``, ADR 0045
of the API) holds the 20 weather icons of the family as SVG, in four styles; the app draws the default one, ``meridien``, the
drawings of the Meridien screen. This script writes them, with the few stroke glyphs the home page uses, into
``app/src/main/kotlin/fr/auxfilsdesidees/vigie/ui/board/FamilyIconData.kt``; ``FamilyIcons.kt`` draws that SVG.

    python tools/family_icons.py <path of vigie-card.js>           # rewrites the Kotlin file
    python tools/family_icons.py <path of vigie-card.js> --check   # exit 1 when the Kotlin file differs

The file records the SHA-256 of the card it was taken from.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "app/src/main/kotlin/fr/auxfilsdesidees/vigie/ui/board/FamilyIconData.kt"
GLYPH_NAMES = ["parapluie", "secheresse", "montagne", "fleur", "flamme", "danger"]


def entries(block: str) -> dict[str, str]:
    """The `name: '<svg body>'` pairs of a block of the card, in order."""
    return {m.group(1): m.group(2) for m in re.finditer(r"^\s*(\w+):\s*'([^']*)'", block, re.M)}


def render(card: str) -> str:
    start = card.index("meridien: { box: '0 0 128 128', icons: {")
    end = card.index("} },", start)
    icons = entries(card[start:end].split("icons: {", 1)[1])
    if len(icons) != 20:
        raise SystemExit(f"expected 20 meridien icons, found {len(icons)}")
    g0 = card.index("const GLYPHS = {")
    glyphs_all = entries(card[g0 : card.index("};", g0)])
    missing = [n for n in GLYPH_NAMES if n not in glyphs_all]
    if missing:
        raise SystemExit(f"glyphs not in the card: {missing}")
    sha = hashlib.sha256(card.encode("utf-8")).hexdigest()
    lines = [
        "package fr.auxfilsdesidees.vigie.ui.board",
        "",
        "// Written by android/tools/family_icons.py from the Home Assistant card of vigie-api",
        f"// (custom_components/vigie/frontend/vigie-card.js, SHA-256 {sha}). Do not edit by hand: run the script.",
        "",
        "/** The 20 weather icons of the Vigie family in the Meridien style, SVG on a box of 128; layers by role class. */",
        "internal val MERIDIEN_ICONS: Map<String, String> =",
        "  mapOf(",
    ]
    lines += [f'    "{k}" to """{v}""",' for k, v in icons.items()]
    lines += ["  )", "", "/** The stroke glyphs of the card the home page uses, SVG on a box of 24. */", "internal val CARD_GLYPHS: Map<String, String> =", "  mapOf("]
    lines += [f'    "{k}" to """{glyphs_all[k]}""",' for k in GLYPH_NAMES]
    lines += ["  )", ""]
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("card", type=Path)
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    text = render(a.card.read_text(encoding="utf-8"))
    if a.check:
        same = OUT.is_file() and OUT.read_text(encoding="utf-8") == text
        print("up to date" if same else f"{OUT.name} differs from the card")
        return 0 if same else 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(text.encode("utf-8"))
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
