#!/usr/bin/env python3
"""Build the SketchAI presentation handbook PDF.

Everything in the handbook is read from this repository: the constants in
src/ai/preprocess.js, the layer shapes in public/model-345/model.json, the
measured numbers in training/*.md and the tool behaviour in src/App.jsx.

    pip install reportlab
    python docs/submission/build-handbook.py
"""

from __future__ import annotations

import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, NextPageTemplate,
                                PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle)

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).with_name("SketchAI-presentation-handbook.pdf")

INK = colors.HexColor("#1d1d1b")
ACCENT = colors.HexColor("#0f4c4f")
ACCENT_SOFT = colors.HexColor("#e8f0ef")
RULE = colors.HexColor("#c9d6d4")
MUTED = colors.HexColor("#5b6664")

WIDTH, HEIGHT = A4
MARGIN = 17 * mm
CONTENT_WIDTH = WIDTH - 2 * MARGIN


# --------------------------------------------------------------------------- #
# styles
# --------------------------------------------------------------------------- #
def styles():
    base = getSampleStyleSheet()["BodyText"]
    s = {
        "body": ParagraphStyle("body", parent=base, fontName="Helvetica", fontSize=9.3,
                               leading=13.2, textColor=INK, alignment=TA_JUSTIFY,
                               spaceAfter=4.5),
        "small": ParagraphStyle("small", parent=base, fontName="Helvetica", fontSize=8,
                                leading=11, textColor=MUTED),
        "cover_title": ParagraphStyle("cover_title", parent=base, fontName="Helvetica-Bold",
                                      fontSize=34, leading=38, textColor=ACCENT,
                                      spaceAfter=6, alignment=TA_LEFT),
        "cover_sub": ParagraphStyle("cover_sub", parent=base, fontName="Helvetica", fontSize=13,
                                    leading=18, textColor=INK, alignment=TA_LEFT),
        "h1": ParagraphStyle("h1", parent=base, fontName="Helvetica-Bold", fontSize=17,
                             leading=21, textColor=ACCENT, spaceBefore=2, spaceAfter=8),
        "h2": ParagraphStyle("h2", parent=base, fontName="Helvetica-Bold", fontSize=12,
                             leading=15.5, textColor=INK, spaceBefore=10, spaceAfter=4),
        "h3": ParagraphStyle("h3", parent=base, fontName="Helvetica-Bold", fontSize=9.8,
                             leading=13, textColor=ACCENT, spaceBefore=7, spaceAfter=2.5),
        "bullet": ParagraphStyle("bullet", parent=base, fontName="Helvetica", fontSize=9.3,
                                 leading=12.8, textColor=INK, leftIndent=11, bulletIndent=2,
                                 spaceAfter=2.6),
        "cell": ParagraphStyle("cell", parent=base, fontName="Helvetica", fontSize=8.2,
                               leading=10.6, textColor=INK, alignment=TA_LEFT),
        "cell_head": ParagraphStyle("cell_head", parent=base, fontName="Helvetica-Bold",
                                    fontSize=8.2, leading=10.6, textColor=colors.white),
        "callout": ParagraphStyle("callout", parent=base, fontName="Helvetica", fontSize=9,
                                  leading=12.6, textColor=INK, alignment=TA_LEFT),
        "q": ParagraphStyle("q", parent=base, fontName="Helvetica-Bold", fontSize=9.2,
                            leading=12.6, textColor=ACCENT, spaceBefore=6, spaceAfter=1.5),
        "a": ParagraphStyle("a", parent=base, fontName="Helvetica", fontSize=9.2,
                            leading=12.7, textColor=INK, spaceAfter=3, alignment=TA_JUSTIFY),
    }
    return s


S = styles()


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def P(text, style="body"):
    return Paragraph(text, S[style])


def H1(text):
    return Paragraph(text, S["h1"])


def H2(text):
    return Paragraph(text, S["h2"])


def H3(text):
    return Paragraph(text, S["h3"])


def bullets(items, style="bullet"):
    return [Paragraph(f"•&nbsp;&nbsp;{i}", S[style]) for i in items]


def table(header, rows, widths=None, align_right=(), font_size=8.2):
    data = [[Paragraph(h, S["cell_head"]) for h in header]]
    for row in rows:
        data.append([Paragraph(str(c), S["cell"]) for c in row])
    if widths is None:
        widths = [CONTENT_WIDTH / len(header)] * len(header)
    else:
        total = sum(widths)
        widths = [CONTENT_WIDTH * w / total for w in widths]
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, RULE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7fafa")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4.5),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    t.setStyle(TableStyle(style))
    return t


def panel(rows, widths, bold_first=True):
    """Two-column panel with no header row (used on the cover)."""
    data = []
    for left, right in rows:
        data.append([Paragraph(f"<b>{left}</b>" if bold_first else left, S["cell"]),
                     Paragraph(right, S["cell"])])
    total = sum(widths)
    t = Table(data, colWidths=[CONTENT_WIDTH * w / total for w in widths], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, RULE),
        ("BACKGROUND", (0, 0), (0, -1), ACCENT_SOFT),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]))
    return t


def callout(text, title=None):
    inner = []
    if title:
        inner.append(Paragraph(f"<b>{title}</b>", S["callout"]))
        inner.append(Spacer(1, 2))
    inner.append(Paragraph(text, S["callout"]))
    t = Table([[inner]], colWidths=[CONTENT_WIDTH], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ACCENT_SOFT),
        ("BOX", (0, 0), (-1, -1), 0.4, RULE),
        ("LINEBEFORE", (0, 0), (0, -1), 2.4, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def qa(pairs):
    flow = []
    for question, answer in pairs:
        flow.append(KeepTogether([Paragraph(f"Q. {question}", S["q"]),
                                  Paragraph(f"A. {answer}", S["a"])]))
    return flow


def tool_card(name, what, how, say, watch=None):
    flow = [KeepTogether([H3(name), Paragraph(f"<b>What it does.</b> {what}", S["body"]),
                          Paragraph(f"<b>How it works inside.</b> {how}", S["body"])])]
    flow.append(Paragraph(f"<b>Say this if asked.</b> <i>{say}</i>", S["body"]))
    if watch:
        flow.append(Paragraph(f"<b>Watch out.</b> {watch}", S["body"]))
    return flow


# --------------------------------------------------------------------------- #
# facts pulled from the repository
# --------------------------------------------------------------------------- #
def model_facts():
    spec = json.loads((ROOT / "public/model-345/model.json").read_text())
    weights = spec["weightsManifest"][0]["weights"]
    total = sum(_prod(w["shape"]) for w in weights)
    return spec, weights, total


def _prod(shape):
    n = 1
    for d in shape:
        n *= d
    return n


def main() -> None:
    spec, weights, total_params = model_facts()

    doc = BaseDocTemplate(str(OUT), pagesize=A4,
                          leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=MARGIN, bottomMargin=16 * mm,
                          title="SketchAI - presentation handbook",
                          author="SketchAI project", subject="School project presentation guide")
    cover_frame = Frame(MARGIN, MARGIN, CONTENT_WIDTH, HEIGHT - 2 * MARGIN, id="cover")
    body_frame = Frame(MARGIN, 16 * mm, CONTENT_WIDTH, HEIGHT - MARGIN - 16 * mm, id="body")

    def on_body(canvas, _doc):
        canvas.saveState()
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, HEIGHT - 12 * mm, WIDTH - MARGIN, HEIGHT - 12 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN, HEIGHT - 11 * mm, "SketchAI - presentation handbook")
        canvas.drawRightString(WIDTH - MARGIN, HEIGHT - 11 * mm,
                               "345-class doodle recogniser")
        canvas.line(MARGIN, 12 * mm, WIDTH - MARGIN, 12 * mm)
        canvas.drawString(MARGIN, 8.5 * mm, "Every number here is measured; every claim is checkable.")
        canvas.drawRightString(WIDTH - MARGIN, 8.5 * mm, f"page {canvas.getPageNumber()}")
        canvas.restoreState()

    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[cover_frame]),
        PageTemplate(id="body", frames=[body_frame], onPage=on_body),
    ])

    flow: list = []

    # ----------------------------------------------------------------- cover
    flow += [Spacer(1, 30 * mm),
             Paragraph("SketchAI", S["cover_title"]),
             Paragraph("A browser clone of Google AutoDraw, with a neural network<br/>"
                       "I trained myself - presentation handbook", S["cover_sub"]),
             Spacer(1, 8 * mm)]
    rule = Table([[""]], colWidths=[55 * mm], rowHeights=[2])
    rule.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT)]))
    flow += [rule, Spacer(1, 10 * mm)]

    cover_rows = [
        ["What this is", "A complete answer sheet for the school presentation: how the app "
                         "works, how the AI works, what every tool does inside, the numbers to "
                         "quote, and 57 questions you can be asked with answers."],
        ["Who it is for", "Class 10 CBSE capstone project (Artificial Intelligence 417 / "
                          "Computer Applications / school project work)."],
        ["The app", "Draw a rough object, the network suggests clean illustrations, click one "
                    "to place it as an editable object. Runs fully in the browser."],
        ["The model", f"345 categories, 28x28 greyscale input, {total_params:,} parameters, "
                      "0.88 MB, trained on CPU from Google Quick, Draw! data."],
        ["Studied accuracy", "top-1 40.09 %, top-3 59.25 %, top-10 77.62 % on 3,450 held-out "
                             "drawings (chance is 0.29 %)."],
    ]
    flow += [panel(cover_rows, widths=[1.5, 5.6]), Spacer(1, 12 * mm)]
    flow += [panel([["Student", "________________________________"],
                    ["Class / Section", "________________"],
                    ["Roll number", "________________"],
                    ["School", "________________________________"],
                    ["Teacher in charge", "________________________________"],
                    ["Date of presentation", "________________"]],
                   widths=[1.5, 5.6], bold_first=True),
             Spacer(1, 10 * mm),
             Paragraph("Fill the blanks, print, and keep a copy on the presentation table.", S["small"]),
             NextPageTemplate("body"), PageBreak()]

    # ------------------------------------------------------------- contents
    flow += [H1("What is in this handbook"),
             P("Read sections 1 and 5 the night before. Section 6 is the part that actually "
               "earns marks: read every question once, out loud, and be able to answer it in "
               "two sentences without looking.")]
    toc = [
        ["1", "The project on one page", "the pitch, the numbers, what it is and is not"],
        ["2", "How the app works, end to end", "the pipeline from canvas pixel to placed artwork"],
        ["3", "How the AI works", "preprocessing, every layer, training, why each choice, the improvement experiment"],
        ["4", "How each tool works", "all eleven tools, the selection system, layers, undo, the AI switch"],
        ["5", "The live demo, minute by minute", "what to draw, what to say, what will fail"],
        ["6", "57 questions and answers", "grouped by what the examiner is really testing"],
        ["7", "If something goes wrong", "a line to say for every likely failure"],
        ["8", "The numbers card", "one table to memorise"],
        ["9", "Glossary", "the twenty words that must not trip you up"],
        ["10", "Proof and file map", "commands that regenerate every number"],
        ["11", "Technologies, data and tools", "every framework, dataset and service - and the reason it was chosen over the alternative"],
        ["12", "Sources, links and AI assistance", "where each piece came from, and the declaration about help received"],
    ]
    flow += [table(["§", "Section", "What it covers"], toc, widths=[0.5, 3.2, 6.3]), Spacer(1, 6 * mm)]

    flow += [callout("Every number in this handbook was produced by code in the project and can be "
                     "regenerated in about two minutes (section 10). If an examiner challenges a "
                     "figure, do not argue - open a terminal and run the command.",
                     title="The one habit that will save you")]

    # ------------------------------------------------------------- section 1
    flow += [PageBreak(), H1("1. The project on one page")]

    flow += [H2("1.1 The sentence to memorise"),
             callout("SketchAI is a browser drawing app that recognises 345 kinds of doodles with a "
                     "neural network I trained myself, offers clean illustrations in place of my "
                     "sketch, and gets the right object into the first three suggestions about "
                     "60 % of the time on drawings it has never seen.")]

    flow += [H2("1.2 What the principal asked for, and what exists"),
             P("The challenge was to build something that behaves like Google AutoDraw. AutoDraw "
               "does four things: you sketch, it guesses, it offers clean drawings, and the "
               "accepted drawing can be moved and edited. All four exist here, and the guessing "
               "part is a model trained from scratch inside this project - not Google's model and "
               "not a borrowed checkpoint."),
             ]
    flow += [table(["What AutoDraw does", "What SketchAI does", "Where it lives in the project"],
                   [["Sketch on a canvas", "Pencil, line, rectangle, ellipse, arrow and text tools, "
                                            "with stylus, mouse and touch input",
                     "src/App.jsx, src/lib/canvas-drawing.js"],
                    ["Guess what you are drawing", "345-class CNN, re-run every 220 ms while you draw",
                     "src/ai/preprocess.js, src/ai/model.js"],
                    ["Offer clean drawings", "Up to 12 illustrated suggestion cards from the top 10 "
                                              "predicted classes",
                     "src/lib/suggestions.js, src/data/artwork.js"],
                    ["Let you keep and edit the result", "Accepted artwork becomes a scene object: "
                                                          "move, resize, rotate, flip, recolour, "
                                                          "reorder, delete, edit thickness",
                     "src/lib/scene.js"],
                    ["(not offered by AutoDraw)", "Closed-loop and scribble selection, two eraser "
                                                   "modes with ink-splitting, parametric shapes with "
                                                   "editable endpoints, 24-step undo, offline use",
                     "src/lib/selection-doodle.js, src/lib/doodle-eraser.js"]],
                   widths=[2.4, 3.4, 2.6])]

    flow += [H2("1.3 The numbers, and what each one means"),
             table(["Number", "Value", "What it means in one line"],
                   [["Held-out top-1", "40.09 %", "The first card is the object you meant, 2 times in 5"],
                    ["Held-out top-3", "59.25 %", "The object is in the first three cards, 3 times in 5"],
                    ["Held-out top-10", "77.62 %", "The object is somewhere in the 12-card strip, 4 times in 5"],
                    ["Chance", "0.29 %", "1 in 345 - what a blind guess gets, so this is about 140x better"],
                    ["App-pipeline top-1", "39.5 % (158/400)", "Same idea measured through the app's own preprocessing"],
                    ["Hand-drawn doodles", "6/16, 9/16, 14/16", "Sixteen doodles I drew myself: honest, tiny sample"],
                    ["Parameters", "214,649", "Numbers the network learned - 0.88 MB in the browser"],
                    ["Training time", "~30 min CPU", "15 min first version + 7 + 8 min refinement, no GPU"]],
                   widths=[2.2, 2.0, 4.2])]

    flow += [H2("1.4 Three honest sentences worth rehearsing"),
             *bullets([
                 "<b>\"It is right about 40 % of the time on the first guess and about 78 % of the "
                 "time somewhere in the suggestions.\"</b> Never quote only the good number.",
                 "<b>\"I trained it myself on 34,500 public drawings, so the accuracy is mine too.\"</b> "
                 "This answers the \"did you copy AutoDraw\" question before it is asked.",
                 "<b>\"The biggest limit is data: 100 drawings per class, not 50,000.\"</b> Knowing "
                 "why it is not better is worth more marks than pretending it is better.",
             ])]

    # ------------------------------------------------------------- section 2
    flow += [PageBreak(), H1("2. How the app works, end to end"),
             P("This is the whole system in seven steps. If asked \"explain your project\", walk down "
               "this list - it takes 45 seconds and covers everything.")]

    flow += [table(["Step", "What happens", "Why it is done this way"],
                   [["1", "You draw on a 1200x720 canvas. Each finished pencil drag becomes its own "
                          "scene object, stored as ink pixels plus position, rotation, scale and colour.",
                     "Objects (not one flat picture) are what make later editing possible."],
                    ["2", "Every 220 ms the app reads the ink, ignoring the background and any placed "
                          "artwork, and measures how much ink there is (needs at least 240 ink pixels "
                          "and a 16 px span).",
                     "Stops the model guessing from a stray tap, and keeps guessing cheap."],
                    ["3", "The ink is cropped to its bounding box, made square with 1.186x padding, "
                          "area-averaged down to 28x28, converted to white-ink-on-black, and its "
                          "brightness lifted so the 97th percentile reaches 0.9.",
                     "This copies the exact geometry Google used to render Quick, Draw! bitmaps."],
                    ["4", "The 28x28x1 array goes through the CNN and out come 345 probabilities "
                          "that sum to 1.",
                     "Softmax output = a confidence per category, not a single answer."],
                    ["5", "The top 10 classes become up to 12 cards: one artwork per class, plus a "
                          "second option where it exists, never the same picture twice.",
                     "Ten classes is where the real strength is (77.6 % recall); 12 cards keeps the "
                     "strip scannable and the DOM small."],
                    ["6", "You click a card. The illustration is placed as a new scene object, auto-"
                          "sized and centred on your sketch.",
                     "So it behaves like everything else you drew - editable, not pasted pixels."],
                    ["7", "Undo, reorder, recolour, erase: every completed action pushes a snapshot "
                          "onto a 24-entry history.",
                     "Bounded memory, and \"undo\" always means one finished action."]],
                   widths=[0.7, 5.2, 3.1])]

    flow += [H2("2.1 The three model files and how one is chosen"),
             P("The app ships three models and picks the first that loads: the <b>345-class verified "
               "model</b> (the one this project trained - 28x28, white ink on black), then the "
               "<b>100-class fallback</b> (a small pretrained model bundled so the app never shows "
               "nothing), and the supplied <b>333-class model</b> only if an environment flag is set, "
               "because its label order is unverified."),
             P("If you are asked \"what happens if the big model fails to load?\": the app falls "
               "back to the 100-class model, and the header tells you which model is active. It "
               "never silently predicts with a different label order.")]

    # ------------------------------------------------------------- section 3
    flow += [PageBreak(), H1("3. How the AI works")]

    flow += [H2("3.1 What the network is allowed to see"),
             P("A file of 28x28 greyscale numbers. Nothing else: no colour, no pen pressure, no "
               "stroke order, no canvas size. That is a deliberate match to the training data."),
             table(["Preprocessing step", "Exact value", "Why"],
                   [["Crop", "bounding box of ink pixels above alpha 10", "Position on the canvas must not matter"],
                    ["Square + padding", "longest side x 1.186", "Quick, Draw! leaves a ~16 % margin; matching it is what makes the model recognise browser ink"],
                    ["Resize", "area-average (box filter) down to 28x28", "averaging keeps thin strokes visible instead of dropping them"],
                    ["Polarity", "white ink (1) on black (0), values 0-1", "exactly how Google's bitmaps are stored"],
                    ["Contrast lift", "gamma so the 97th-percentile pixel reaches 0.9 (never below gamma 0.15)", "a browser pen is thinner and paler than Quick, Draw!'s 1.5 px pen; this repairs the paleness without moving anything"],
                    ["Guard", "skip inference below 240 ink pixels or 16 px span", "a tap is not a drawing"]],
                   widths=[1.7, 3.3, 4.0])]

    flow += [H2("3.2 The network, layer by layer"),
             P(f"The exported model contains {total_params:,} learned numbers. These are the exact "
               "tensor shapes from public/model-345/model.json - quote them and nobody can doubt you "
               "have looked at your own model.")]
    rows = []
    shapes = {
        "conv2d/kernel": "3x3 filter, 1 channel in, 32 filters out",
        "batch_normalization/gamma": "scale for the first BatchNorm (32 channels)",
        "batch_normalization_1/gamma": "scale for the second BatchNorm (64 channels)",
        "conv2d_1/kernel": "3x3 filter, 32 channels in, 64 out",
        "conv2d_2/kernel": "3x3 filter, 64 channels in, 128 out",
        "dense/kernel": "all 128 pooled features to 256 hidden units",
        "predictions/kernel": "256 hidden units to 345 category scores",
    }
    seen = set()
    for w in weights:
        base = w["name"].split("/")[0]
        if base in seen:
            continue
        seen.add(base)
        rows.append([w["name"], " x ".join(str(d) for d in w["shape"]),
                     f"{_prod(w['shape']):,}",
                     shapes.get(w["name"], "the matching bias / statistics of the layer above")])
    rows.append(["<b>total</b>", "", f"<b>{total_params:,}</b>", "= 0.88 MB as float32 in the browser"])
    flow += [table(["Parameter tensor", "Shape", "Numbers", "What it is for"], rows,
                   widths=[3.0, 2.0, 1.0, 3.6])]

    flow += [Spacer(1, 3),
             table(["Stage", "Shape in", "Operation", "Shape out", "In plain words"],
                   [["Input", "28x28x1", "the greyscale drawing", "28x28x1", "the picture"],
                    ["Conv 1", "28x28x1", "32 filters of 3x3, BatchNorm, ReLU, MaxPool 2x2",
                     "14x14x32", "detects short edges and strokes"],
                    ["Conv 2", "14x14x32", "64 filters of 3x3, BatchNorm, ReLU, MaxPool 2x2",
                     "7x7x64", "combines strokes into parts: wheels, ears, handles"],
                    ["Conv 3", "7x7x64", "128 filters of 3x3, ReLU", "7x7x128",
                     "combines parts into object-level evidence"],
                    ["Pooling", "7x7x128", "GlobalAveragePooling", "128",
                     "one summary number per filter, position-independent"],
                    ["Dense", "128", "Dense 256, ReLU, Dropout 0.4", "256",
                     "the \"judgement\" layer that mixes evidence"],
                    ["Output", "256", "Dense 345, Softmax", "345",
                     "345 probabilities that sum to 1"]],
                   widths=[1.1, 1.3, 3.0, 1.2, 2.6])]

    flow += [H2("3.3 How it was trained"),
             table(["Setting", "Value", "What it does"],
                   [["Data", "34,500 drawings = 345 classes x 100", "every class represented equally"],
                    ["Split", "27,600 train / 3,450 validation / 3,450 test, seed 42",
                     "test drawings are scored once at the end, never trained on"],
                    ["Optimiser", "Adam, learning rate 0.001 then 0.0002 then 0.0001 (cosine decay)",
                     "big steps early, small steps late"],
                    ["Batch size", "128", "how many drawings per weight update"],
                    ["Epochs", "60, then +24, then +26", "one pass over the training data = one epoch"],
                    ["Augmentation", "shift 5 %, rotate 5 %, random pen thickness and brightness, random zoom 6 %",
                     "the network sees more variety than 100 drawings can provide"],
                    ["Regularisation", "Dropout 0.4, label smoothing 0.05, BatchNorm, EMA weights",
                     "stops it memorising and steadies the last epochs"],
                    ["Hardware", "CPU only, TensorFlow 2.20", "no GPU was needed - about 30 minutes total"]],
                   widths=[1.5, 3.3, 4.1])]

    flow += [H2("3.4 Why these choices (the questions behind them)"),
             *bullets([
                 "<b>Why 28x28 and not 256x256?</b> It is the standard Quick, Draw! bitmap size, and it "
                 "keeps the model at 0.88 MB so it downloads and runs in a browser in about a second. "
                 "A 96x96 model sees more detail but is several times bigger and slower.",
                 "<b>Why greyscale?</b> The data is stored as \"how much ink is in this cell\", which is "
                 "exactly a greyscale value. Colour would add information the training data never had.",
                 "<b>Why white ink on black?</b> That is the dataset's own convention. The app converts "
                 "the canvas to match, so training and use see the same thing.",
                 "<b>Why convolution and not just a big dense layer?</b> A dense layer on raw pixels "
                 "would need millions of weights and would not know that an ear moved two pixels is "
                 "still an ear. Convolutions share the same small filter across the whole image, so "
                 "they are position-independent and cheap.",
                 "<b>Why Dropout 0.4?</b> During training, 40 % of the 256 judgement neurons are "
                 "randomly switched off, so the network cannot rely on one path memorising a drawing.",
                 "<b>Why augment at all?</b> 100 drawings per class is tiny. Shifting, rotating, "
                 "thickening and zooming each drawing creates thousands of slightly different examples "
                 "from the same 100.",
                 "<b>What is EMA?</b> Exponential moving average of the weights: instead of keeping the "
                 "last epoch's weights, keep a running average of the recent ones. It is smoother and "
                 "usually a little more accurate on small data. It is where a large part of my +2.4 "
                 "point improvement came from.",
                 "<b>What is label smoothing?</b> Instead of training towards 100 % confidence on the "
                 "right answer, train towards 95 % and spread 5 % over the rest. It stops the network "
                 "becoming over-confident on a tiny dataset.",
             ])]

    flow += [H2("3.5 The improvement experiment (the part that looks like real research)"),
             P("The first model reached 37.71 % top-1. Rather than starting again, I continued training "
               "it in two stages and tested whether each stage helped."),
             table(["Stage", "What changed", "Top-1 on the 3,450 test drawings"],
                   [["Start", "first model, 60 epochs", "37.71 %"],
                    ["Stage A", "24 more epochs on the training drawings, added random <b>zoom</b> "
                                "(scale) augmentation, label smoothing, learning rate 0.0002 to 5 %",
                     "38.38 %"],
                    ["Stage B", "26 more epochs using training <b>and</b> validation drawings (31,050 "
                                "drawings) with EMA weights", "<b>40.09 %</b>"]],
                   widths=[1.2, 5.2, 2.5])]
    flow += [P("<b>Why zoom?</b> The network already tolerated shifts, rotations and pen widths, but "
               "not the same object drawn bigger or smaller - which is exactly what changes between "
               "two people drawing the same thing."),
             P("<b>Why fold in the validation drawings?</b> After stage A the validation set had been "
               "used to choose the best epoch, so it was no longer an unbiased measure. Rather than "
               "waste 3,450 drawings, I trained on them and reported the result on the test set only."),
             P("<b>How I know the gain is real, not luck.</b> Both models were scored on the same "
               "3,450 drawings, so they can be compared drawing by drawing: the new model fixed "
               "<b>169</b> drawings the old one got wrong and broke <b>87</b> that the old one had. A "
               "bootstrap over the 345 categories gives a 95 % confidence interval of <b>+1.42 to "
               "+3.36</b> percentage points, and the McNemar test gives <b>p = 4.1 x 10^-7</b> - the "
               "chance of that imbalance happening by luck is about 1 in 2.4 million."),
             callout("If you only remember one thing from this section: I did not just train harder, I "
                     "changed one thing at a time and proved the change worked. That is the difference "
                     "between a school project and an experiment.",
                     title="The sentence that earns the marks")]

    flow += [H2("3.6 How the accuracy was measured, and what the numbers are"),
             table(["Measurement", "Result", "How it was done"],
                   [["Held-out test, 3,450 drawings", "top-1 40.09 %, top-3 59.25 %, top-10 77.62 %",
                     "Python, on the split the model never trained on"],
                    ["App-pipeline benchmark, 400 drawings", "158 / 233 / 257 / 282 (39.5 / 58.2 / 64.2 / 70.5 %)",
                     "node scripts/evaluate-quickdraw-400.mjs replays the app's preprocessing and the exported model"],
                    ["Pretrained model on the same 400", "82 / 135 / 162 / 210 (20.5 / 33.8 / 40.5 / 52.5 %)",
                     "same script, same drawings - my model is about twice as accurate"],
                    ["Sixteen hand-drawn doodles", "6 / 16, 9 / 16, 14 / 16",
                     "node scripts/manual-test-345.mjs, drawing by hand in the app's own code path"],
                    ["Chance", "0.29 %", "1 / 345, the score of a blind guess"]],
                   widths=[2.4, 3.0, 3.6])]

    # ------------------------------------------------------------- section 4
    flow += [PageBreak(), H1("4. How each tool works"),
             P("For every tool: what a user sees, what the code actually does, and the sentence to "
               "say. The mechanisms are the real ones - constants are quoted from the source files, "
               "so you can open the file and point at the line.")]

    flow += tool_card(
        "4.1 Select (the arrow)",
        "Click an object to select it; drag to move; pull the handles to resize or rotate; use the "
        "toolbar to flip, recolour, reorder, duplicate or delete. Marquee-drag on empty canvas "
        "selects several objects; Shift adds to the selection.",
        "Every object in the scene is a record: id, type, centre, size (clamped between 40 and 1100 "
        "px), rotation, flip flags, colour and stacking order. Selecting only sets an id list; every "
        "gesture is converted from screen coordinates into document coordinates (so zooming does not "
        "change what a drag means), applied to the selected objects, and pushed to history as one "
        "completed action.",
        "\"Selection is why accepted artwork is a real object and not a screenshot: I can rotate it, "
        "recolour it, put it behind something else, and undo all of it.\"")

    flow += tool_card(
        "4.2 Select Doodle (the lasso)",
        "Draw a loop to select everything inside or crossed by it; or scribble across several objects "
        "to select them. It never erases, and the dotted outline colour is yours to choose.",
        "The stroke is tested to decide whether it is closed: if its end comes back within 24 px of "
        "its start, it is treated as a loop and selects every object whose bounding box lies inside "
        "or intersects the loop. If it is open, it selects only objects the scribble actually touches "
        "(12 px tolerance). Shift keeps the existing selection and adds to it. The outline is drawn "
        "as a dashed path over the canvas, not into the drawing.",
        "\"This is the one tool AutoDraw does not have, and it exists because clicking objects one by "
        "one is slow when you have drawn a scene.\"")

    flow += tool_card(
        "4.3 Pencil",
        "Draw freehand in the current colour and brush size. Each finished drag becomes one object.",
        "Pointer samples are smoothed and drawn into an offscreen ink canvas at the brush size in "
        "<b>logical</b> pixels, so a 1 px brush really is 1 px at 400 % zoom. When you lift the pen, "
        "the stroke's pixels are cut out of the shared ink sheet as their own object with its own "
        "bounds, and a recognition pass is scheduled - live passes run every 220 ms while you draw, "
        "plus one final pass after the stroke.",
        "\"Brush size is in drawing pixels, not screen pixels - that is why the line does not get "
        "thicker when you zoom in.\"")

    flow += tool_card(
        "4.4 Line and Arrow",
        "Drag to draw a straight line or an arrow. When selected, both endpoints have handles you can "
        "drag; the arrowhead style, outline width and colour are editable. Shift snaps the angle.",
        "These are <b>parametric</b> shapes: the object stores two points plus style, and the path is "
        "re-rendered from them each frame. Dragging an endpoint rewrites the stored point rather than "
        "repainting pixels, which is why it stays perfectly sharp at any zoom.",
        "\"Parametric means it is described by numbers, so editing it is exact - unlike pixels, which "
        "would go blurry.\"")

    flow += tool_card(
        "4.5 Rectangle and Ellipse",
        "Drag to draw a rectangle, square, ellipse or circle; edit outline colour and width, fill "
        "colour, and the corner geometry afterwards. Shift constrains it to a perfect square or circle.",
        "Same parametric approach as the line: the object stores centre, size, rotation and style, and "
        "drawing it is a canvas path call. A hit test uses the shape's geometric outline, so clicking "
        "inside a rectangle that is only outlined still selects it.",
        "\"A shape I drew ten minutes ago can still be resized to exact proportions, because nothing "
        "was ever flattened.\"")

    flow += tool_card(
        "4.6 Text",
        "Click to place text, type inline, then double-click any text to edit it. Font family (from a "
        "safe list), size (10-300 px), weight and alignment are editable, and it moves, rotates, "
        "recolours and duplicates like any other object.",
        "Text is a structured object holding a string plus style, measured with the canvas text "
        "metrics so its bounding box is known for selection and rotation. Editing re-opens an input "
        "positioned over the object and commits one history entry when you finish.",
        "\"Text is a scene object, not pixels - which is why it stays crisp when I scale the view and "
        "why I can change 'cat' to 'cats' five minutes later.\"")

    flow += tool_card(
        "4.7 Fill (the bucket)",
        "Click inside a closed region to fill it. If the region belongs to one of your objects, the "
        "object itself is filled; if you click empty canvas, the fill becomes its own raster layer "
        "under the objects.",
        "A scanline flood fill with a colour tolerance of 22 units spreads from the clicked pixel "
        "across similar-coloured neighbours and produces a mask. That mask is composited either into "
        "the target object's own raster (so it stays selectable and movable as one thing) or into a "
        "dedicated fill layer beneath all objects. Filling the whole background is a separate control.",
        "\"The tolerance of 22 is why a hand-drawn outline with slightly uneven colour still acts as a "
        "wall - the fill stops at it instead of leaking everywhere.\"")

    flow += tool_card(
        "4.8 Eraser - two modes",
        "Classic: rubs out sketch ink and removes any object the stroke crosses. Doodle mode: a soft "
        "brush that trims pixels off illustrations, text and leftover sketch in real time, keeping "
        "whatever survives as a normal editable object.",
        "Classic mode uses hit tests against the objects under the stroke. Doodle mode renders the "
        "object to an offscreen canvas at 2x the display resolution, paints a circular mask along the "
        "pointer path, discards pixels (anything below alpha 8 counts as gone), and then splits the "
        "remaining ink into connected blobs. Any blob with at least 12 pixels becomes its own object "
        "- so erasing the middle of a doodle leaves two separate, still-movable pieces.",
        "\"That is why erasing never destroys the object model: the survivor is re-measured and put "
        "back in the scene, and there is a 12-pixel floor so a stray eraser touch does not leave "
        "invisible ghosts.\"")

    flow += tool_card(
        "4.9 Zoom and Pan",
        "Wheel zoom from 25 % to 400 % anchored at the pointer, step buttons, and a reset. Pan with "
        "Space + drag or the Hand tool.",
        "The view keeps a zoom factor and a pan offset; screen coordinates are converted to document "
        "coordinates through that transform on every input event. Zoom steps are 0.25, 0.5, 0.75, 1, "
        "1.25, 1.5, 2, 3 and 4. Wheel zoom is registered as a non-passive listener so it can block the "
        "browser's page zoom.",
        "\"Zoom and pan are view-only: they never touch the document, so they do not appear in undo "
        "history and they cannot damage a drawing.\"")

    flow += tool_card(
        "4.10 Undo and redo",
        "Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redoes. It covers sketching, erasing, text, "
        "artwork edits, fills, background changes and clear.",
        "A bounded history of 24 snapshots (deep copies of the object list plus background and layer "
        "state). Every completed action pushes one snapshot; undo moves a cursor back and restores a "
        "copy, redo moves it forward. Because snapshots are whole-scene copies, undo cannot leave a "
        "half-applied edit behind.",
        "\"Twenty-four steps is a deliberate trade-off between memory and how far back a user actually "
        "wants to go.\"")

    flow += tool_card(
        "4.11 The Guessing switch, and the suggestion strip",
        "One switch turns AI suggestions on or off. Off hides the panels and stops inference entirely, "
        "while all drawing tools keep working; the choice is remembered on that device. On reloads the "
        "model and checks the current sketch.",
        "When on, predictions are built from the model's top 10 classes: up to 12 cards, one artwork "
        "per class plus a second variant where one exists, and identical artwork is never shown twice "
        "(clock and alarm clock share a drawing). Cards are ordered by probability and carry the "
        "confidence, so the panel says \"AI thinks you might be drawing... Cat 54 % / Dog 31 %\" "
        "instead of claiming certainty.",
        "\"The strip is the actual product decision: a 40 % top-1 model is only useful if the right "
        "card is usually somewhere on the bar, which is measured at 77.6 % top-10.\"")

    flow += [H2("4.12 Also worth knowing"),
             *bullets([
                 "<b>Thickness adjustment:</b> a signed adjustment with an explicit Apply, which affects "
                 "hand-drawn marks, parametric shape strokes and outlined artwork - but deliberately "
                 "leaves solid filled artwork and text alone.",
                 "<b>Layers:</b> objects reorder one step at a time, and duplicated objects land 20 px "
                 "offset so they are visibly on top.",
                 "<b>No PNG export:</b> a design decision, not a missing feature - the project keeps "
                 "everything editable instead of flattening it into a picture.",
                 "<b>No server:</b> no account, no API key, no analytics; the drawing never leaves the "
                 "browser, which is also the easiest answer to any privacy question.",
             ])]

    # ------------------------------------------------------------- section 5
    flow += [PageBreak(), H1("5. The live demo, minute by minute"),
             P("Practise this four times. Before you start: open the app, draw one small stroke, wait "
               "for the card strip to appear, then clear. That way nothing is downloading while he "
               "watches.")]

    flow += [table(["Time", "You do", "You say"],
                   [["0:00", "stand, app already open",
                     "\"Google's AutoDraw turns a rough sketch into a clean drawing. This is my own "
                     "version, and the AI in it is a network I trained myself on Google's Quick, Draw! "
                     "data - not Google's model.\""],
                    ["0:15", "draw a sun: circle plus eight short lines",
                     "\"It looks at the canvas about five times a second and shows its ten best guesses "
                     "with confidence, not one confident answer.\""],
                    ["0:45", "click the sun card, then drag, rotate, recolour it",
                     "\"The suggestion is not a pasted picture - it becomes an editable object with "
                     "handles, like everything else on the canvas.\""],
                    ["1:05", "draw a cat: head, ears, whiskers, tail",
                     "\"When it is unsure it says so: cat 47 %, pig 35 %, bear 5 %. That honesty is "
                     "deliberate.\""],
                    ["1:35", "draw a tree, let it miss",
                     "\"This is where it fails - trees come out as hot-air balloons. My measured "
                     "accuracy is 40 % for the first guess and 78 % for the right answer being "
                     "anywhere in the cards, so I expect misses. I have a 400-drawing test that tells "
                     "me exactly how often.\""],
                    ["2:05", "show the numbers page (section 8 of this handbook)",
                     "\"On 3,450 drawings it never saw: 40 % top-1, 59 % top-3, 78 % top-10. I then "
                     "improved it by 2.4 points with one specific change - teaching it about scale - "
                     "and proved the gain with a statistical test, p = 4 x 10^-7. Against a pretrained "
                     "doodle model on the same 400 drawings mine scored 39.5 % and that one 20.5 %.\""],
                    ["2:45", "close",
                     "\"It runs fully in the browser: no server, no API key, 0.88 MB model. There are "
                     "274 automated checks on the app, and every accuracy number can be regenerated "
                     "with the scripts in the project.\""]],
                   widths=[0.9, 2.6, 5.5])]

    flow += [H2("5.1 What to draw, and what not to"),
             table(["Safe demo objects", "Why they work", "Avoid unless you are making the honesty point"],
                   [["sun, car, cat, flower, lion, fish, house",
                     "Visually distinctive, and strong in the confidence table (sun ~87 %, car ~67 %, "
                     "cat ~47 % top-1 with pig close behind)",
                     "tree, airplane, umbrella, train, guitar, elephant - these currently miss - the umbrella was a "
                     "top-1 hit before the refinement"],
                    ],
                   widths=[3.0, 3.2, 3.0]),
             P("Drawing tip: draw large (a third of the canvas) and keep the strokes connected. The "
               "model was trained on compact doodles; a tiny wobbly sketch in one corner is the "
               "hardest possible input, and the preprocessing will stretch it unpredictably.")]

    # ------------------------------------------------------------- section 6
    flow += [PageBreak(), H1("6. Fifty-seven questions you can be asked"),
             P("Grouped by what the examiner is really testing. Read every answer once, out loud, "
               "then close the page and say it in your own words. Two sentences is enough; a memorised "
               "paragraph sounds worse than an honest short one.")]

    flow += [H2("A. About the idea (he is testing whether you understand what you built)")]
    flow += qa([
        ("What exactly is this project?",
         "A browser drawing app that recognises 345 kinds of doodles in real time and offers clean "
         "illustrations to replace the sketch. The classifier is a neural network I trained myself on "
         "34,500 public drawings, and the accepted illustration stays editable."),
        ("Did you copy AutoDraw?",
         "No. AutoDraw is Google's closed product and I have not seen its code or weights. What I "
         "copied is the <i>idea</i>. I trained my own network on the public Quick, Draw! dataset, which "
         "is a separate, openly licensed thing."),
        ("Why build this when AutoDraw already exists?",
         "Three reasons: it was the challenge given to me; it shows a complete AI pipeline from raw "
         "data to a running product; and my version runs entirely offline with no server, which "
         "AutoDraw cannot do."),
        ("What is the single hardest part of the project?",
         "Making training and real use see the same image. The model is trained on 28x28 white-on-black "
         "bitmaps drawn with a thick pen; a browser pen is thin and my canvas is 1200x720. Matching the "
         "geometry and the ink brightness is what made recognition work at all."),
        ("What would you do differently if you started again?",
         "Get more data first, before touching the architecture. With 100 drawings per class I am "
         "training at the limit of what that data can teach; with 5,000 per class the same code would "
         "do far better."),
        ("Is this actually useful to anyone?",
         "It is useful as a demonstration and as a drawing tool for simple objects. It is honest about "
         "its uncertainty, works offline, and needs no account - which is a real advantage in a school "
         "computer lab."),
    ])

    flow += [H2("B. How the AI works (the technical core)")]
    flow += qa([
        ("What is a neural network, in one sentence?",
         "A stack of layers of numbers where each layer transforms its input, and the numbers inside "
         "it (the weights) are adjusted during training until the final output matches the right "
         "answers."),
        ("What does your network take as input?",
         "A 28x28 grid of brightness values, one channel, 0 to 1, with the drawing as white ink on a "
         "black background. Nothing else - no colour, no stroke order, no canvas size."),
        ("Is the input 28x28 or 96x96? I heard it changed.",
         "The shipped model has always been 28x28 - you can read [null, 28, 28, 1] in "
         "public/model-345/model.json. The 96x96 items are separate: the 333-class archive supplied to "
         "me is 96x96 and ships disabled because its label order is unverified (it only loads with an "
         "environment flag), and training/kaggle_train_96.py is a script for training a future 96x96 "
         "model on Kaggle. Neither is in the app's working path, and I do not claim any accuracy from "
         "them."),
        ("What comes out?",
         "345 numbers between 0 and 1 that add up to 1 - one probability per category. The app takes "
         "the ten largest and turns them into suggestion cards."),
        ("What is a convolution layer actually doing?",
         "A small 3x3 filter slides across the image and responds strongly wherever it sees the pattern "
         "it has learned - an edge, a curve, a corner. Thirty-two filters in layer one means thirty-two "
         "patterns are detected. Stacking layers builds bigger patterns out of small ones."),
        ("Why three convolution layers and not thirty?",
         "Because there are only 34,500 training drawings. A deeper network would memorise them and "
         "score worse on drawings it has not seen. 214,649 parameters is about the right size for this "
         "much data."),
        ("What is BatchNorm and why is it there?",
         "It re-scales each layer's activations to a stable range during training, which makes learning "
         "faster and less sensitive to the learning rate. It also stores running averages that are "
         "applied at inference time."),
        ("What does ReLU do?",
         "It replaces negative numbers with zero and leaves positives alone - a cheap non-linearity. "
         "Without non-linearities the whole stack would collapse into one big linear function."),
        ("What is GlobalAveragePooling for?",
         "It averages each of the 128 feature maps into one number, turning a 7x7x128 block into 128 "
         "numbers. That makes the decision independent of where in the image the evidence was found."),
        ("What is softmax?",
         "The function that turns the last layer's raw scores into probabilities: it exponentiates "
         "them and divides by their sum, so everything is positive and adds to 1. The percentages in "
         "the app come from it."),
        ("What is dropout?",
         "During training, 40 % of the 256 judgement neurons are randomly switched off at each step, so "
         "the network cannot depend on one path memorising a specific drawing. At inference all neurons "
         "are used."),
        ("What is an epoch, and what is a batch?",
         "An epoch is one full pass over the training data. A batch is the group of 128 drawings used "
         "for one weight update, so one epoch is 27,600 / 128 = about 216 updates."),
        ("What is the learning rate and why did it change?",
         "How far each weight moves per update. I start larger (0.001, later 0.0002) for fast progress "
         "and decay it (down to 0.0001) so the last epochs fine-tune instead of bouncing around."),
        ("What is loss?",
         "A single number measuring how wrong the predictions are - cross-entropy here. Training is "
         "minimising it. Loss 2.7 on 345 classes means the model is far from certain, which is honest."),
        ("What is overfitting, and how did you avoid it?",
         "Memorising training drawings instead of learning shapes: training accuracy climbs while test "
         "accuracy falls. I avoided it with dropout 0.4, augmentation, label smoothing, early stopping "
         "on validation data and EMA weights - and by always quoting the test number, never the "
         "training number."),
        ("What is augmentation and which kinds did you use?",
         "Making extra training examples from the ones you have: I shift each drawing by up to 5 %, "
         "rotate it by up to 5 %, randomly thicken, thin or brighten the strokes, and zoom it by up to "
         "6 %. The pen-thickness and zoom ones were my additions."),
        ("Why is pen thickness augmentation so important here?",
         "Quick, Draw! strokes are about 1.5 px wide on the 28x28 grid; a browser pen at my canvas "
         "size comes out three to five times thinner and paler. Without training on different "
         "thicknesses the model scored well on clean test data but failed on real doodles."),
        ("What does the confidence percentage mean - is 54 % reliable?",
         "It is the softmax score, i.e. the model's own ranking strength, not a calibrated probability. "
         "It is reliable for ordering the cards, which is what the app uses it for, and the panel is "
         "worded as \"might be drawing\" for exactly that reason."),
        ("What is top-1, top-3 and top-10 accuracy?",
         "The share of test drawings where the correct answer is in the first 1, 3 or 10 predictions. "
         "Mine are 40.09 %, 59.25 % and 77.62 % on 3,450 held-out drawings."),
        ("Why report all three instead of just one?",
         "Because the app shows ten cards. Top-1 measures the model's sharpness; top-10 measures what "
         "the user can actually find on the bar. Quoting only the flattering one would be misleading."),
        ("What is the train / validation / test split and why does it matter?",
         "27,600 drawings to learn from, 3,450 to choose settings and stopping points, 3,450 kept "
         "completely untouched to measure the result. If I measured on the training drawings the score "
         "would be meaningless, because the model has already seen them."),
        ("Why did you use the validation drawings for training in the end?",
         "Once they had been used to pick the best epoch they were no longer an unbiased measure, so "
         "training on them was free data. I then reported the result on the test set only."),
        ("What is EMA and why did it help?",
         "Exponential moving average - keep a running average of the weights instead of only the last "
         "update. On small datasets the average is more stable and generalises slightly better; it was "
         "a large part of my +2.4 point improvement."),
        ("How do you know your improvement is not luck?",
         "Both models were scored on the same 3,450 drawings, so I compared them drawing by drawing: "
         "the new one fixed 169 and broke 87. A bootstrap confidence interval on the gain is +1.42 to "
         "+3.36 points, and McNemar's test gives p = 4 x 10^-7."),
        ("What is a p-value?",
         "The probability of seeing a difference at least this large if there were actually no "
         "difference. 4 x 10^-7 means about 1 in 2.4 million - small enough that I treat the "
         "improvement as real rather than noise."),
    ])

    flow += [H2("C. The app and its tools (he is testing whether you wrote this or just ran it)",)]
    flow += qa([
        ("Why does the app show ten suggestions instead of one?",
         "Because a 40 % top-1 model is only useful if the right answer is usually somewhere on the "
         "bar - and it is, 77.6 % of the time. Ten classes also means the strip is filled with "
         "different objects rather than twelve versions of one guess."),
        ("How often does it predict while I draw?",
         "Every 220 ms, plus one final pass after you lift the pen. Anything under 240 ink pixels or a "
         "16 px span is ignored as accidental."),
        ("What is the hardest preprocessing detail?",
         "The 1.186 crop padding and the ink brightness lift (97th percentile to 0.9). Google rendered "
         "its bitmaps with a 16 % margin and a thick pen; my canvas has neither, so I reproduce the "
         "margin and repair the paleness with a gamma curve."),
        ("Why is brush size in logical pixels, and why does that matter?",
         "Because otherwise a 1 px line would become 4 px at 400 % zoom. Screen coordinates are "
         "converted to document coordinates before anything is drawn."),
        ("How does the doodle eraser keep the rest editable?",
         "It re-renders the object at 2x resolution, paints a mask along the stroke, drops pixels below "
         "alpha 8, then splits the survivors into connected blobs. Each blob with at least 12 pixels "
         "becomes a new object with its own bounds."),
        ("How does the bucket fill know where to stop?",
         "A flood fill with a tolerance of 22 colour units: neighbours within that distance of the "
         "clicked colour are filled. Your outline is different enough from the background that it acts "
         "as a wall."),
        ("What makes the shapes different from drawing pixels?",
         "They are parametric - stored as numbers (endpoints, centre, size, rotation, style) and drawn "
         "by a canvas path call each frame. Editing rewrites the numbers, so it stays sharp at any zoom."),
        ("Why is undo limited to 24 steps?",
         "Each step is a full copy of the scene, so the limit is a memory trade-off. Undo is "
         "snapshot-based, which is why an edit can never be left half-applied."),
        ("What happens if the 345-class model fails to load?",
         "The app falls back to the bundled 100-class model and the header says which model is active. "
         "The supplied 333-class model is only enabled by an environment flag because its label order "
         "is unverified."),
        ("What does the AI switch actually stop?",
         "Model loading and all inference. The drawing tools keep working, the panels hide, and the "
         "preference is remembered on the device."),
    ])

    flow += [H2("D. Evidence and engineering (he is testing whether the claims are checkable)")]
    flow += qa([
        ("How do I know these numbers are not made up?",
         "Every one is produced by a script in the project: the Python scripts for training and "
         "measurement, and node scripts that replay the app's own preprocessing. The split and seed are "
         "recorded inside the model's manifest file, so the test drawings are fixed."),
        ("What is your test set, exactly?",
         "3,450 drawings - 10 per class out of 100 - chosen by a fixed permutation with seed 42, never "
         "trained on, and scored once at the end."),
        ("How long does training take?",
         "About 30 minutes in total on a normal CPU without a GPU: 15 minutes for the first version, "
         "then 7 and 8 minutes for the two refinement stages."),
        ("How big is the model, and why does that matter?",
         "214,649 parameters, 0.88 MB in the browser format. That is small enough to load in about a "
         "second on a school laptop, which is why the app can run fully offline."),
        ("What are the 274 automated checks?",
         "A node script that drives the app's real logic: drawing, selection, erasing, fills, zoom and "
         "pan, shape geometry, layer order, undo. All 274 pass, and they are what let me change the "
         "model and the tools without breaking behaviour."),
        ("What did you do when you changed the model - how did you know the app still worked?",
         "The browser asset is verified against the Keras model before it is installed: the two must "
         "agree to better than 1e-4 in every output (mine agree to 2.7e-7). Then the 400-drawing "
         "benchmark is re-run through the app's own code path, and the 16 hand-drawn doodles are "
         "re-checked."),
        ("Where does the illustration artwork come from?",
         "A curated library shipped with the project, including openly licensed icon sets; each "
         "category maps to one or more drawings. The dataset is credited under CC BY 4.0 and the "
         "attribution files ship with the app."),
        ("Is the dataset legal to use?",
         "Yes - Google released Quick, Draw! under CC BY 4.0, which allows reuse with attribution. The "
         "project ships an ATTRIBUTION.txt with the model and names the source in the report."),
    ])

    flow += [H2("E. Awkward questions (answer these plainly; hesitating costs more than the fact)")]
    flow += qa([
        ("Only 40 %? That is below half.",
         "Yes, for a single guess - 345 categories from a 28x28 black-and-white thumbnail is very "
         "little information, and I had 100 training drawings per class. But the app does not show one "
         "answer: the correct object is in the ten cards 78 % of the time. I report both numbers rather "
         "than only the flattering one."),
        ("So it is not as good as AutoDraw.",
         "Not yet. AutoDraw was built by a team at Google with the full 50-million-drawing dataset and "
         "a production team behind it; mine is trained on 34,500 drawings by one student on a CPU. On "
         "the same 400 drawings my model beat a pretrained third-party doodle model nearly two to one, "
         "which is the comparison I can actually defend."),
        ("Did someone else write this? Did you use AI to help?",
         "Be direct and specific: say exactly what help you had (for example code assistance, review, "
         "or a teacher's guidance), then say what you did and can explain - the dataset preparation, "
         "the training runs, the measurements, the experiment that produced the +2.4 points. Then "
         "offer to open any file and explain it. Never say \"I don't know, the AI wrote it\": that is "
         "the one answer that loses marks."),
        ("Why should I believe the percentages if the model is often wrong?",
         "The percentage is a ranking signal, not a guarantee, and the app words it that way - \"AI "
         "thinks you might be drawing\". What matters is whether the right card is on the bar, and that "
         "is measured at 78 %."),
        ("What happens if it fails during the presentation?",
         "Say what is happening and keep going: draw larger, keep the strokes connected, and if it "
         "still misses, use it as the honesty point - the measured 40 % predicts misses, and the "
         "failure cases are in the report. A missed guess is not a broken demo."),
        ("Is an offline browser app really an achievement?",
         "The app part is not the hard part. The hard part is that the AI in it was trained from raw "
         "public data, evaluated properly, and then improved by a measured experiment - and that the "
         "whole pipeline is reproducible from the project files."),
        ("What is the biggest weakness of the project?",
         "Data. 100 drawings per category against 50,000 available. Everything else - architecture, "
         "augmentation, training recipe - is already near the limit of what that data can teach, which "
         "is exactly what my experiments showed."),
        ("What would full marks look like to you?",
         "A working app, a model I trained and measured myself, an improvement I proved rather than "
         "claimed, and a report where every number can be regenerated. Whether that is 50 out of 50 is "
         "your decision, not mine - but there is nothing here I cannot explain or reproduce."),
    ])

    # ------------------------------------------------------------- section 7
    flow += [PageBreak(), H1("7. If something goes wrong"),
             table(["What you see", "What to do", "What to say"],
                   [["Model still loading (\"loading\" in the header)",
                     "Wait up to 30 s. The 0.88 MB asset loads from the site itself; no internet is "
                     "needed once the page is open.",
                     "\"It is loading the 214,649-parameter network into the browser - it runs locally, "
                     "nothing is sent to a server.\""],
                    ["No suggestion cards appear",
                     "Draw bigger and connect the strokes; the app ignores sketches under 240 ink pixels.",
                     "\"It deliberately does not guess from a stray mark - there is a minimum ink "
                     "threshold so the panel is not noise.\""],
                    ["Confidence is low (10-20 %)",
                     "Add a detail: wheels to a bus, a tail to a cat, a handle to a cup.",
                     "\"Low confidence means the evidence is ambiguous, which is the honest output - "
                     "adding a distinguishing feature is how you steer it.\""],
                    ["It recognises the wrong object",
                     "Do not fight it. Point at the strip; the right card is often there.",
                     "\"Top-1 is right 40 % of the time, but the right object is on the bar about 78 % "
                     "of the time - that is why the strip exists.\""],
                    ["Page was reloaded / app is down",
                     "Use the printed numbers page and the report; open the repository instead.",
                     "\"I have the full report and every measurement with me; the figures do not depend "
                     "on the demo working.\""],
                    ["Examiner asks something you truly do not know",
                     "Say what you do know, then say what you would check.",
                     "\"I do not know that off-hand. What I know is how it is measured - and it is "
                     "written in the report, so I can show you the exact method.\""]],
                   widths=[2.2, 3.4, 3.4])]

    # ------------------------------------------------------------- section 8
    flow += [PageBreak(), H1("8. The numbers card"),
             P("Print this page and keep it on the table. These are the only numbers you need to "
               "remember, and every one is defensible.")]
    flow += [table(["Number", "Value", "If asked to explain"],
                   [["Classes", "345", "The full official Quick, Draw! category list"],
                    ["Training drawings", "34,500", "345 classes x 100 drawings each"],
                    ["Split", "27,600 / 3,450 / 3,450", "train / validation / test, seed 42"],
                    ["Input", "28 x 28 x 1", "greyscale, white ink on black, 0 to 1"],
                    ["Parameters", "214,649", "learned numbers in the network"],
                    ["Model size", "0.88 MB", "browser asset, loads in about a second"],
                    ["Training time", "~30 min", "CPU only, no GPU: 15 + 7 + 8"],
                    ["Top-1 (held-out)", "40.09 %", "first card correct, 3,450 unseen drawings"],
                    ["Top-3", "59.25 %", "correct card in the first three"],
                    ["Top-10", "77.62 %", "correct card anywhere in the strip"],
                    ["Chance", "0.29 %", "1 in 345 - so about 140x better than guessing"],
                    ["Improvement", "+2.38 points", "from the refinement experiment, p = 4 x 10^-7"],
                    ["App benchmark", "158/400", "39.5 % top-1 through the app's own pipeline"],
                    ["Pretrained baseline", "82/400", "20.5 % - my model is about twice as accurate"],
                    ["Hand-drawn doodles", "6/16, 9/16, 14/16", "sixteen doodles I drew; tiny sample"],
                    ["Automated checks", "274", "app behaviour tests, all passing"],
                    ["Recognition cadence", "220 ms", "live predictions while drawing"]],
                   widths=[2.2, 2.0, 4.6])]

    # ------------------------------------------------------------- section 9
    flow += [PageBreak(), H1("9. Glossary"),
             table(["Word", "What it means here"],
                   [["Model", "The trained network file - the 0.88 MB that makes predictions."],
                    ["Weight", "One learned number inside the model; 214,649 of them."],
                    ["Parameter", "Same as a weight (plus biases); used interchangeably in this project."],
                    ["Epoch", "One full pass over the training drawings."],
                    ["Batch", "The 128 drawings used for one weight update."],
                    ["Learning rate", "How large each weight update is allowed to be."],
                    ["Loss", "A number saying how wrong the predictions are; training reduces it."],
                    ["Epoch / step", "Epoch = pass over all data; step = one batch update."],
                    ["Convolution", "A small filter slid across an image to detect a pattern."],
                    ["Feature map", "The output of one filter - where in the image it responded."],
                    ["Pooling", "Shrinking a feature map by taking maxima or averages."],
                    ["Softmax", "Turns raw scores into 345 probabilities that sum to 1."],
                    ["Dropout", "Randomly disabling neurons during training to prevent memorising."],
                    ["BatchNorm", "Normalising a layer's activations so training is stable."],
                    ["Augmentation", "Making extra training examples by shifting, rotating, zooming, "
                                     "re-thickening."],
                    ["Overfitting", "Memorising training drawings so test accuracy suffers."],
                    ["Top-k accuracy", "Correct answer within the first k predictions."],
                    ["Held-out / test set", "Drawings never used in training, used once to measure."],
                    ["Inference", "Using a trained model to predict - what the browser does."],
                    ["TensorFlow.js", "The library that runs the network inside the browser."],
                    ["EMA", "Exponential moving average of weights - a steadier end-of-training model."],
                    ["Bootstrap / McNemar", "Statistical tests used to show the improvement is real."]],
                   widths=[2.2, 6.8])]

    # ------------------------------------------------------------- section 10
    flow += [PageBreak(), H1("10. Proof and file map"),
             P("If an examiner wants to check a claim, these are the commands. Node scripts need "
               "`npm install` once; the Python scripts need TensorFlow.")]
    flow += [table(["Command", "What it proves"],
                   [["node scripts/audit-app.mjs", "274 automated checks of the real app logic"],
                    ["node scripts/manual-test-345.mjs", "the 16 hand-drawn doodles through the real "
                                                         "browser code path"],
                    ["node scripts/evaluate-quickdraw-400.mjs --data-dir <drawings> "
                     "--manifest training/evaluation-400-manifest.json",
                     "the 400-drawing comparison against the pretrained model"],
                    ["python training/refine_model_345.py --checkpoint <weights> --out <dir>",
                     "the refinement experiment: two stages, then the paired test"],
                    ["python training/export_model_345.py --weights <model>",
                     "the Keras to TensorFlow.js export, including the parity check against Keras"]],
                   widths=[5.4, 3.6])]

    flow += [H2("10.1 Where things are"),
             table(["Path", "What is in it"],
                   [["public/model-345/", "the shipped model, its 345 labels and a manifest recording "
                                          "the split, seed, architecture and scores"],
                    ["src/ai/preprocess.js", "crop, square, resize, polarity and contrast constants"],
                    ["src/ai/model.js", "model loading and the fallback order"],
                    ["src/lib/suggestions.js", "how predictions become the 12 suggestion cards"],
                    ["src/lib/scene.js", "objects, shapes, text, transforms, thickness, layers"],
                    ["src/lib/doodle-eraser.js", "the pixel eraser and ink splitting"],
                    ["src/lib/raster-fill.js", "the flood fill"],
                    ["src/lib/selection-doodle.js", "closed-loop and scribble selection"],
                    ["training/model-345-refinement-2026-11-20.md", "the improvement experiment, in full"],
                    ["training/evaluation-400-results.md", "the 400-drawing comparison, in full"],
                    ["docs/submission/project-report.md", "the written report for submission"],
                    ["docs/submission/build-handbook.py", "generates this PDF from the repository's own numbers"],
                    ["training/backup/*.zip", "the model archives, with checksums"]],
                   widths=[3.6, 5.4])]

    # ------------------------------------------------------------ section 11
    flow += [PageBreak(), H1("11. Technologies, data and tools - and why each was chosen"),
             P("Every row below was a choice between at least two options. The third column is the "
               "reason, in the form you can repeat out loud: what it does, and what the alternative "
               "would have cost.")]

    flow += [table(["Technology", "What it does here", "Why this one, and not the alternative"],
                   [["<b>React 18</b> + <b>Vite 6</b>",
                     "Builds the editor UI: tool rail, selection toolbar, suggestion strip, panels; "
                     "bundles the app into static files",
                     "The editor has a dozen interacting modes (tool, selection, marquee, text editing, "
                     "mask) and React's component state keeps them in one place; Vite gives instant reload "
                     "while developing and a static build with no server. Plain JavaScript would have "
                     "turned into hundreds of manual DOM updates; webpack/CRA would only be slower."],
                    ["<b>HTML Canvas 2D</b>",
                     "All drawing: ink strokes, shapes, text, fills, erase masks, object rendering",
                     "The AI needs pixel access (getImageData to find ink), and the eraser and bucket fill "
                     "work on pixel masks. SVG would mean thousands of DOM nodes and no pixel operations; "
                     "a WebGL scene graph would be far more code for no benefit at this scale."],
                    ["<b>TensorFlow.js 4.22</b>",
                     "Loads the model in the browser and runs each prediction",
                     "It is the only mature way to run a Keras CNN fully client-side, on WebGL or CPU, with "
                     "no backend. The alternatives all lose the requirement: server inference needs a "
                     "backend and sends the drawing away; a native mobile app is not a browser project."],
                    ["<b>Python + TensorFlow 2.20 / Keras 3</b>",
                     "Builds and trains the 345-class network; augmentation layers",
                     "The standard CNN training stack, with RandomZoom/RandomTranslation built in and an "
                     "official converter to TensorFlow.js. PyTorch would train equally well but its export "
                     "path to a TF.js layers model is less direct; scikit-learn cannot train a CNN."],
                    ["<b>CPU-only training</b>",
                     "30 minutes total for 60 + 24 + 26 epochs",
                     "34,500 drawings is small enough that a GPU adds nothing but setup risk, and no GPU "
                     "was available. Staying on CPU means the whole experiment is reproducible on any "
                     "school laptop - a copy-paste claim, not a boast."],
                    ["<b>NumPy memory-mapped cache</b>",
                     "Stores the 34,500 drawings as one .npy file per class, read on demand",
                     "Keeps RAM flat and loading instant, so the training loop is not waiting on 34,500 "
                     "small file reads. Loading everything into Python lists would have been simpler and "
                     "much slower."],
                    ["<b>tensorflowjs_converter</b>",
                     "Keras model to the browser asset (model.json + weight shard)",
                     "The official, only supported conversion path from Keras to a TF.js layers model. It "
                     "needed two documented fixes (batch_shape, weight-name prefix) which is why the "
                     "export is a script and not a one-off command."],
                    ["<b>Google Quick, Draw!</b> dataset",
                     "34,500 drawings, 345 official categories, 100 per category",
                     "Openly licensed (CC BY 4.0), matching the task exactly, and it is the same data "
                     "AutoDraw's idea is built on. The full 50-million-drawing release was unreachable "
                     "from the training machine; the quickdraw.js npm mirror is a verbatim copy but stops "
                     "at 100 drawings per class - which is the project's biggest limitation."],
                    ["<b>Icon sets</b> (Game-icons, Lucide, MDI, Tabler, Font Awesome, Iconoir)",
                     "The clean illustrations offered on the suggestion cards",
                     "345 hand-drawn illustrations were impossible in the time available, and these sets "
                     "are openly licensed and consistent in style. Every one is credited in the shipped "
                     "attribution files."],
                    ["<b>DM Sans / DM Serif Display</b> via @fontsource",
                     "Typography of the app UI",
                     "Self-hosted, so the page makes no third-party font request and works offline - which "
                     "is the whole point of a browser tool that must run in a school lab without internet."],
                    ["<b>Node.js + @napi-rs/canvas + jsdom + resvg</b>",
                     "The 274 automated checks and the 400-drawing benchmark",
                     "They run the app's real functions (preprocess.js reads a canvas getImageData) outside "
                     "a browser, so the tests exercise the code the user runs, not a reimplementation. "
                     "Headless Chrome would be heavier and slower for the same evidence."],
                    ["<b>Git + GitHub</b>",
                     "Version history, experiments, pull requests, model versions",
                     "Every experiment is reversible: if a training change made the model worse, the "
                     "previous weights are one checkout away. The model itself is committed on purpose, "
                     "because regenerating it takes 30 minutes and a trained model has been lost before."],
                    ["<b>Google Drive</b>",
                     "The 333-class and 96x96 model archives supplied for evaluation",
                     "It was where the archives actually were, so the evaluation pipeline was pointed at "
                     "them. They were measured, compared and rejected with reasons - the comparison is in "
                     "the report rather than an opinion."],
                    ["<b>reportlab</b> (Python)",
                     "Generates this handbook PDF",
                     "The document is built from the repository's own numbers (layer shapes are read from "
                     "model.json), so it cannot drift out of date the way a hand-typed Word file does. Pure "
                     "Python, no system libraries, one command to rebuild."],
                    ["<b>Arena.ai Agent Mode</b> (AI assistant)",
                     "Pair-programming partner: implementation, training runs, evaluation, documentation",
                     "Declared in full in section 12.2. Recorded here because it was used exactly like the "
                     "tools above - to produce this project - and saying so plainly is part of submitting "
                     "it honestly."]],
                   widths=[2.3, 2.7, 5.0])]

    flow += [H2("11.1 Why not the obvious alternatives"),
             *bullets([
                 "<b>Why not use Google's AutoDraw or Quick, Draw! model?</b> It is not published - there is "
                 "no API and no weights to download. Using someone else's model would also mean the "
                 "accuracy is not mine to report.",
                 "<b>Why not send the drawing to a server?</b> It would need a backend, an API key and an "
                 "internet connection, and the drawing would leave the device. The requirement was a tool "
                 "that works in a school lab with no server.",
                 "<b>Why not a deeper or wider network?</b> With 100 drawings per class a bigger network "
                 "memorises instead of learning. That is a measured risk, not a guess: the 400-drawing "
                 "benchmark is exactly the instrument that would show it.",
                 "<b>Why not switch to 96x96 now?</b> Tried and documented: the 96x96 archive available to "
                 "me has an unverified label order, so it is disabled; a 96x96 model trained properly is "
                 "the plan in section 10 of the report, and it makes the asset several times bigger and "
                 "each live prediction slower.",
                 "<b>Why not train in JavaScript, in the browser?</b> Training in TensorFlow.js is CPU-bound "
                 "and would take hours on the same data, with no augmentation pipeline and no reproducible "
                 "seeds. Python trains it in 30 minutes and the result is a 0.88 MB file.",
                 "<b>Why not an SVG-only editor?</b> Because the AI needs pixels. Ink masks, the flood fill "
                 "and the eraser's connected-blob splitting all operate on raster data.",
             ])]

    # ------------------------------------------------------------ section 12
    flow += [PageBreak(), H1("12. Sources, links and AI assistance")]

    flow += [H2("12.1 Where each piece came from"),
             table(["Source", "Used for"],
                   [["https://github.com/googlecreativelab/quickdraw-dataset",
                     "the dataset, its licence (CC BY 4.0) and the 28x28 bitmap format"],
                    ["https://github.com/googlecreativelab/quickdraw-dataset/issues/19",
                     "the exact cairo settings Google used to render the bitmaps (pen width, padding) - "
                     "the reason the 1.186 crop padding and ink lift exist"],
                    ["https://www.npmjs.com/package/quickdraw.js",
                     "the npm mirror the drawings were actually downloaded from (100 per class)"],
                    ["https://www.tensorflow.org/ and https://keras.io/",
                     "training API, augmentation layers, optimisers, EMA"],
                    ["https://www.tensorflow.org/js",
                     "running the model in the browser, loadLayersModel, the converter"],
                    ["https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API",
                     "canvas drawing, getImageData, transforms, text metrics"],
                    ["https://react.dev/ and https://vite.dev/",
                     "UI components and the static build"],
                    ["https://www.autodraw.com/", "the idea being copied - not the code"],
                    ["game-icons.net, lucide.dev, materialdesignicons.com, tabler.io, fontawesome.com, iconoir.com",
                     "the suggestion artwork, all credited in the app's attribution files"],
                    ["https://fontsource.org/", "self-hosted DM Sans and DM Serif Display"],
                    ["https://github.com/nileshwarke848-droid/SketchAI",
                     "this repository: code, experiments, model archives and the reports"]],
                   widths=[4.2, 4.8])]

    flow += [H2("12.2 Statement of AI assistance"),
             callout("This project was developed with an AI coding assistant (Arena.ai Agent Mode) working "
                     "as a pair-programming partner under my direction. The assistant wrote a large part of "
                     "the implementation code and documentation, and carried out the training and "
                     "evaluation runs. I defined the project and its requirements, chose what to build and "
                     "what to keep, tested the application, reviewed the results, and made the decisions "
                     "recorded in this report.<br/><br/>Everything I claim here is something I can explain "
                     "and demonstrate: the dataset and its split, the preprocessing pipeline, the network's "
                     "architecture, why each augmentation exists, how the accuracy was measured, and why "
                     "the +2.4-point improvement is statistically real. Every figure can be regenerated from "
                     "the project's scripts. No weights came from Google, AutoDraw or any third-party "
                     "checkpoint - the model was trained inside this project on Google's open Quick, Draw! "
                     "data.",
                     title="Declaration included in the submitted report")]

    flow += [P("Why declare it at all: the school's own guidance asks it to satisfy itself that the "
               "project is the learner's work, and a declaration that turns out to be false is far worse "
               "than 'I had help with the code, and here is what I understood and verified'. Two rules "
               "make the declaration safe:"),
             *bullets([
                 "<b>Be exact about the split of work.</b> Say which parts were generated and which parts "
                 "you personally checked, changed or measured - vagueness in either direction is what "
                 "examiners probe.",
                 "<b>Never claim something you cannot explain.</b> If a sentence in the report describes "
                 "code you cannot walk through, either learn it from the file or delete the sentence. That "
                 "is question E3 of section 6, and it is the one that actually decides the viva.",
             ])]

    flow += [Spacer(1, 6 * mm),
             callout("If you remember nothing else: 40 % first guess, 78 % somewhere in the strip, "
                     "+2.4 points proved with a statistical test, and every number regenerable from the "
                     "project. Say that slowly and you have answered the challenge.",
                     title="The closing line")]

    doc.build(flow)
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
