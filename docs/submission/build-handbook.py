#!/usr/bin/env python3
"""Render docs/submission/presentation-handbook.md to a print-ready A4 PDF.

The Markdown file is the source of truth; this script is only the layout. It
understands the small subset of Markdown the handbook uses:

    # H1            title (first one becomes the cover; later ones start a page)
    ## H2           new page, section heading
    ### H3          sub-heading
    | a | b |       table (line 2 is the |---| separator; an all-empty header
                    row renders as a two-column panel with no header)
    > text          callout box (consecutive lines merge)
    - text          bullet
    **text**  *text*  `code`   inline emphasis

Usage:  pip install reportlab
        python docs/submission/build-handbook.py
"""

from __future__ import annotations

import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, PageBreak, PageTemplate, Paragraph,
                                Spacer, Table, TableStyle)

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "presentation-handbook.md"
OUT = HERE / "SketchAI-presentation-handbook.pdf"

INK = colors.HexColor("#1d1d1b")
ACCENT = colors.HexColor("#0f4c4f")
ACCENT_SOFT = colors.HexColor("#e8f0ef")
RULE = colors.HexColor("#c9d6d4")
MUTED = colors.HexColor("#5b6664")

WIDTH, HEIGHT = A4
MARGIN = 17 * mm
CONTENT_WIDTH = WIDTH - 2 * MARGIN


def build_styles():
    base = getSampleStyleSheet()["BodyText"]
    return {
        "cover_title": ParagraphStyle("cover_title", parent=base, fontName="Helvetica-Bold",
                                      fontSize=25, leading=30, textColor=ACCENT, spaceAfter=8),
        "cover_sub": ParagraphStyle("cover_sub", parent=base, fontName="Helvetica", fontSize=11.5,
                                    leading=16, textColor=INK, spaceAfter=6),
        "h1": ParagraphStyle("h1", parent=base, fontName="Helvetica-Bold", fontSize=17, leading=21,
                             textColor=ACCENT, spaceAfter=9),
        "h2": ParagraphStyle("h2", parent=base, fontName="Helvetica-Bold", fontSize=12, leading=15.5,
                             textColor=INK, spaceBefore=9, spaceAfter=4),
        "body": ParagraphStyle("body", parent=base, fontName="Helvetica", fontSize=9.3, leading=13.2,
                               textColor=INK, alignment=TA_JUSTIFY, spaceAfter=4.5),
        "note": ParagraphStyle("note", parent=base, fontName="Helvetica", fontSize=8, leading=11,
                               textColor=MUTED, spaceAfter=4),
        "bullet": ParagraphStyle("bullet", parent=base, fontName="Helvetica", fontSize=9.3,
                                 leading=12.8, textColor=INK, leftIndent=11, bulletIndent=2,
                                 spaceAfter=2.6),
        "cell": ParagraphStyle("cell", parent=base, fontName="Helvetica", fontSize=8.2, leading=10.6,
                               textColor=INK, alignment=TA_LEFT),
        "cell_head": ParagraphStyle("cell_head", parent=base, fontName="Helvetica-Bold", fontSize=8.2,
                                    leading=10.6, textColor=colors.white),
        "callout": ParagraphStyle("callout", parent=base, fontName="Helvetica", fontSize=9,
                                  leading=12.6, textColor=INK, alignment=TA_LEFT),
        "question": ParagraphStyle("question", parent=base, fontName="Helvetica-Bold", fontSize=9.2,
                                   leading=12.6, textColor=ACCENT, spaceBefore=6, spaceAfter=1.5),
    }


S = build_styles()


# --------------------------------------------------------------------------- #
# inline markdown -> reportlab markup
# --------------------------------------------------------------------------- #
def inline(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"`([^`]+)`", r'<font face="Courier" size="8">\1</font>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", text)
    return text


def cell_paragraph(text: str, header: bool = False) -> Paragraph:
    return Paragraph(inline(text), S["cell_head" if header else "cell"])


# --------------------------------------------------------------------------- #
# block renderers
# --------------------------------------------------------------------------- #
def render_table(rows: list[list[str]]) -> Table:
    header, body = rows[0], rows[1:]
    empty_header = all(not h.strip() for h in header)
    columns = len(header)

    data = []
    if not empty_header:
        data.append([cell_paragraph(h, header=True) for h in header])
    for row in body:
        row = row + [""] * (columns - len(row))
        data.append([cell_paragraph(c) for c in row])

    # Column widths: give wider columns more room when the text says so.
    weights = [1.0] * columns
    for index in range(columns):
        longest = max([len(row[index]) for row in rows] or [1])
        weights[index] = max(0.5, min(4.0, longest / 40))
    total = sum(weights)
    widths = [CONTENT_WIDTH * w / total for w in weights]

    table = Table(data, colWidths=widths, repeatRows=0 if empty_header else 1, hAlign="LEFT")
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4.5),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if empty_header:
        style += [("BACKGROUND", (0, 0), (0, -1), ACCENT_SOFT)]
    else:
        style += [("BACKGROUND", (0, 0), (-1, 0), ACCENT),
                  ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7fafa")])]
    table.setStyle(TableStyle(style))
    return table


def render_callout(lines: list[str]) -> Table:
    inner = []
    for index, line in enumerate(lines):
        if index:
            inner.append(Spacer(1, 3))
        inner.append(Paragraph(inline(line), S["callout"]))
    table = Table([[inner]], colWidths=[CONTENT_WIDTH], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ACCENT_SOFT),
        ("BOX", (0, 0), (-1, -1), 0.4, RULE),
        ("LINEBEFORE", (0, 0), (0, -1), 2.4, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def parse(markdown: str) -> list:
    """Turn the handbook Markdown into reportlab flowables."""
    flow: list = []
    lines = markdown.splitlines()
    index = 0
    first_h1 = True
    pending_break = False

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if not stripped:
            index += 1
            continue

        # ---- headings
        if stripped.startswith("# "):
            if pending_break:
                flow.append(PageBreak())
                pending_break = False
            flow.append(Paragraph(inline(stripped[2:]), S["cover_title" if first_h1 else "h1"]))
            if first_h1:
                rule = Table([[""]], colWidths=[55 * mm], rowHeights=[2])
                rule.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT)]))
                flow += [rule, Spacer(1, 6 * mm)]
            first_h1 = False
            index += 1
            continue

        if stripped.startswith("## "):
            if not first_h1:
                flow.append(PageBreak())
            flow.append(Paragraph(inline(stripped[3:]), S["h1"]))
            index += 1
            continue

        if stripped.startswith("### "):
            flow.append(Paragraph(inline(stripped[4:]), S["h2"]))
            index += 1
            continue

        # ---- tables
        if stripped.startswith("|"):
            rows = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                raw = lines[index].strip().strip("|")
                if "-" in raw and re.fullmatch(r"[\s|:-]+", raw):  # the |---| separator only
                    index += 1
                    continue
                rows.append([c.strip() for c in raw.split("|")])
                index += 1
            if rows:
                flow += [render_table(rows), Spacer(1, 5)]
            continue

        # ---- callouts
        if stripped.startswith("> "):
            block = []
            while index < len(lines) and lines[index].strip().startswith("> "):
                block.append(lines[index].strip()[2:].strip())
                index += 1
            flow += [render_callout(block), Spacer(1, 5)]
            continue

        # ---- bullets
        if stripped.startswith("- "):
            while index < len(lines) and lines[index].strip().startswith("- "):
                flow.append(Paragraph(f"•&nbsp;&nbsp;{inline(lines[index].strip()[2:])}", S["bullet"]))
                index += 1
            flow.append(Spacer(1, 3))
            continue

        # ---- paragraph (may span several lines)
        block = []
        while index < len(lines):
            current = lines[index].strip()
            if (not current or current.startswith(("#", "|", "> ", "- "))):
                break
            block.append(current)
            index += 1
        text = " ".join(block)

        if text.startswith("**Q") and text.count("**") >= 2:
            flow.append(Paragraph(inline(text), S["question"]))
        elif text.startswith("*") and text.endswith("*") and text.count("*") == 2:
            flow.append(Paragraph(inline(text), S["note"]))
        else:
            flow.append(Paragraph(inline(text), S["body"]))

    return flow


def main() -> None:
    markdown = SOURCE.read_text()

    doc = BaseDocTemplate(str(OUT), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=MARGIN, bottomMargin=16 * mm,
                          title="SketchAI - presentation handbook",
                          author="SketchAI project", subject="School project presentation guide")
    frame = Frame(MARGIN, 16 * mm, CONTENT_WIDTH, HEIGHT - MARGIN - 16 * mm, id="body")

    def on_page(canvas, _doc):
        canvas.saveState()
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, HEIGHT - 12 * mm, WIDTH - MARGIN, HEIGHT - 12 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN, HEIGHT - 11 * mm, "SketchAI - presentation handbook")
        canvas.drawRightString(WIDTH - MARGIN, HEIGHT - 11 * mm, "345-class doodle recogniser")
        canvas.line(MARGIN, 12 * mm, WIDTH - MARGIN, 12 * mm)
        canvas.drawString(MARGIN, 8.5 * mm, "Every number here is measured; every claim is checkable.")
        canvas.drawRightString(WIDTH - MARGIN, 8.5 * mm, f"page {canvas.getPageNumber()}")
        canvas.restoreState()

    doc.addPageTemplates([PageTemplate(id="body", frames=[frame], onPage=on_page)])
    doc.build(parse(markdown))
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB) from {SOURCE.name}")


if __name__ == "__main__":
    main()
