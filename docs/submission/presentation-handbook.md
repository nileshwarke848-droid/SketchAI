# SketchAI — presentation handbook

**A browser clone of Google AutoDraw, with a neural network I trained myself.**

| | |
| --- | --- |
| Student | ____________________________ |
| Class / Section | ____________________________ |
| Roll number | ____________________________ |
| School | ____________________________ |
| Teacher in charge | ____________________________ |
| Date of presentation | ____________________________ |

*Fill the blanks, print, and keep a copy on the presentation table.*

## Contents

| § | Section | What it covers |
| --- | --- | --- |
| 1 | The project on one page | the pitch, the numbers, what it is and is not |
| 2 | How the app works, end to end | the pipeline from canvas pixel to placed artwork |
| 3 | How the AI works | preprocessing, every layer, training, why each choice, the improvement experiment |
| 4 | How each tool works | all eleven tools, the selection system, layers, undo, the AI switch |
| 5 | The live demo, minute by minute | what to draw, what to say, what will fail |
| 6 | 57 questions and answers | grouped by what the examiner is really testing |
| 7 | If something goes wrong | a line to say for every likely failure |
| 8 | The numbers card | one table to memorise |
| 9 | Glossary | the words that must not trip you up |
| 10 | Proof and file map | commands that regenerate every number |
| 11 | Technologies, data and tools | every framework and dataset — and the reason it was chosen over the alternative |
| 12 | Sources, links and AI assistance | where each piece came from, and the declaration about help received |

> **The one habit that will save you.** Every number in this handbook was produced by code in the project and can be regenerated in about two minutes (section 10). If an examiner challenges a figure, do not argue — open a terminal and run the command.

## 1. The project on one page

### 1.1 The sentence to memorise

> SketchAI is a browser drawing app that recognises 345 kinds of doodles with a neural network I trained myself, offers clean illustrations in place of my sketch, and gets the right object into the first three suggestions about 60 % of the time on drawings it has never seen.

### 1.2 What the principal asked for, and what exists

The challenge was to build something that behaves like Google AutoDraw. AutoDraw does four things: you sketch, it guesses, it offers clean drawings, and the accepted drawing can be moved and edited. All four exist here, and the guessing part is a model trained from scratch inside this project — not Google's model and not a borrowed checkpoint.

| What AutoDraw does | What SketchAI does | Where it lives in the project |
| --- | --- | --- |
| Sketch on a canvas | Pencil, line, rectangle, ellipse, arrow and text tools, with stylus, mouse and touch input | `src/App.jsx`, `src/lib/canvas-drawing.js` |
| Guess what you are drawing | 345-class CNN, re-run every 220 ms while you draw | `src/ai/preprocess.js`, `src/ai/model.js` |
| Offer clean drawings | Up to 12 illustrated suggestion cards from the top 10 predicted classes | `src/lib/suggestions.js`, `src/data/artwork.js` |
| Let you keep and edit the result | Accepted artwork becomes a scene object: move, resize, rotate, flip, recolour, reorder, delete, edit thickness | `src/lib/scene.js` |
| *(not offered by AutoDraw)* | Closed-loop and scribble selection, two eraser modes with ink splitting, parametric shapes with editable endpoints, 24-step undo, offline use | `src/lib/selection-doodle.js`, `src/lib/doodle-eraser.js` |

### 1.3 The numbers, and what each one means

| Number | Value | What it means in one line |
| --- | --- | --- |
| Held-out top-1 | 40.09 % | the first card is the object you meant, 2 times in 5 |
| Held-out top-3 | 59.25 % | the object is in the first three cards, 3 times in 5 |
| Held-out top-10 | 77.62 % | the object is somewhere in the 12-card strip, 4 times in 5 |
| Chance | 0.29 % | 1 in 345 — what a blind guess gets, so this is about 140× better |
| App-pipeline top-1 | 39.5 % (158/400) | the same idea measured through the app's own preprocessing |
| Hand-drawn doodles | 6/16, 9/16, 14/16 | sixteen doodles I drew myself: honest, tiny sample |
| Parameters | 214,649 | numbers the network learned — 0.88 MB in the browser |
| Training time | ~30 min CPU | 15 min first version + 7 + 8 min refinement, no GPU |

### 1.4 Three honest sentences worth rehearsing

- **"It is right about 40 % of the time on the first guess and about 78 % of the time somewhere in the suggestions."** Never quote only the good number.
- **"I trained it myself on 34,500 public drawings, so the accuracy is mine too."** This answers the "did you copy AutoDraw" question before it is asked.
- **"The biggest limit is data: 100 drawings per class, not 50,000."** Knowing why it is not better is worth more marks than pretending it is better.

## 2. How the app works, end to end

This is the whole system in seven steps. If asked "explain your project", walk down this list — it takes 45 seconds and covers everything.

| Step | What happens | Why it is done this way |
| --- | --- | --- |
| 1 | You draw on a 1200×720 canvas. Each finished pencil drag becomes its own scene object, stored as ink pixels plus position, rotation, scale and colour. | Objects (not one flat picture) are what make later editing possible. |
| 2 | Every 220 ms the app reads the ink, ignoring the background and any placed artwork, and measures how much ink there is (needs at least 240 ink pixels and a 16 px span). | Stops the model guessing from a stray tap, and keeps guessing cheap. |
| 3 | The ink is cropped to its bounding box, made square with 1.186× padding, area-averaged down to 28×28, converted to white-ink-on-black, and its brightness lifted so the 97th percentile reaches 0.9. | This copies the exact geometry Google used to render Quick, Draw! bitmaps. |
| 4 | The 28×28×1 array goes through the CNN and out come 345 probabilities that sum to 1. | Softmax output = a confidence per category, not a single answer. |
| 5 | The top 10 classes become up to 12 cards: one artwork per class, plus a second option where it exists, never the same picture twice. | Ten classes is where the real strength is (77.6 % recall); 12 cards keeps the strip scannable and the DOM small. |
| 6 | You click a card. The illustration is placed as a new scene object, auto-sized and centred on your sketch. | So it behaves like everything else you drew — editable, not pasted pixels. |
| 7 | Undo, reorder, recolour, erase: every completed action pushes a snapshot onto a 24-entry history. | Bounded memory, and "undo" always means one finished action. |

### 2.1 The three model files and how one is chosen

The app ships three models and picks the first that loads: the **345-class verified model** (the one this project trained — 28×28, white ink on black), then the **100-class fallback** (a small pretrained model bundled so the app never shows nothing), and the supplied **333-class model** only if an environment flag is set, because its label order is unverified.

If asked "what happens if the big model fails to load?": the app falls back to the 100-class model, and the header tells you which model is active. It never silently predicts with a different label order.

## 3. How the AI works

### 3.1 What the network is allowed to see

A file of 28×28 greyscale numbers. Nothing else: no colour, no pen pressure, no stroke order, no canvas size. That is a deliberate match to the training data.

| Preprocessing step | Exact value | Why |
| --- | --- | --- |
| Crop | bounding box of ink pixels above alpha 10 | position on the canvas must not matter |
| Square + padding | longest side × 1.186 | Quick, Draw! leaves a ~16 % margin; matching it is what makes the model recognise browser ink |
| Resize | area-average (box filter) down to 28×28 | averaging keeps thin strokes visible instead of dropping them |
| Polarity | white ink (1) on black (0), values 0–1 | exactly how Google's bitmaps are stored |
| Contrast lift | gamma so the 97th-percentile pixel reaches 0.9 (never below gamma 0.15) | a browser pen is thinner and paler than Quick, Draw!'s 1.5 px pen; this repairs the paleness without moving anything |
| Guard | skip inference below 240 ink pixels or 16 px span | a tap is not a drawing |

### 3.2 The network, layer by layer

The exported model contains 214,649 learned numbers. These are the exact tensor shapes from `public/model-345/model.json` — quote them and nobody can doubt you have looked at your own model.

| Parameter tensor | Shape | Numbers | What it is for |
| --- | --- | --- | --- |
| `conv2d/kernel` | 3 × 3 × 1 × 32 | 288 | 3×3 filter, 1 channel in, 32 filters out |
| `batch_normalization/*` | 32 each | 128 | scale, offset and running statistics for the first BatchNorm |
| `conv2d_1/kernel` | 3 × 3 × 32 × 64 | 18,432 | 3×3 filter, 32 channels in, 64 out |
| `batch_normalization_1/*` | 64 each | 256 | the same for the second BatchNorm |
| `conv2d_2/kernel` + bias | 3 × 3 × 64 × 128 (+128) | 73,856 | 3×3 filter, 64 channels in, 128 out |
| `dense/kernel` + bias | 128 × 256 (+256) | 33,024 | all 128 pooled features to 256 hidden units |
| `predictions/kernel` + bias | 256 × 345 (+345) | 88,665 | 256 hidden units to 345 category scores |
| **total** | | **214,649** | = 0.88 MB as float32 in the browser |

| Stage | Shape in | Operation | Shape out | In plain words |
| --- | --- | --- | --- | --- |
| Input | 28×28×1 | the greyscale drawing | 28×28×1 | the picture |
| Conv 1 | 28×28×1 | 32 filters of 3×3, BatchNorm, ReLU, MaxPool 2×2 | 14×14×32 | detects short edges and strokes |
| Conv 2 | 14×14×32 | 64 filters of 3×3, BatchNorm, ReLU, MaxPool 2×2 | 7×7×64 | combines strokes into parts: wheels, ears, handles |
| Conv 3 | 7×7×64 | 128 filters of 3×3, ReLU | 7×7×128 | combines parts into object-level evidence |
| Pooling | 7×7×128 | GlobalAveragePooling | 128 | one summary number per filter, position-independent |
| Dense | 128 | Dense 256, ReLU, Dropout 0.4 | 256 | the "judgement" layer that mixes evidence |
| Output | 256 | Dense 345, Softmax | 345 | 345 probabilities that sum to 1 |

### 3.3 How it was trained

| Setting | Value | What it does |
| --- | --- | --- |
| Data | 34,500 drawings = 345 classes × 100 | every class represented equally |
| Split | 27,600 train / 3,450 validation / 3,450 test, seed 42 | test drawings are scored once at the end, never trained on |
| Optimiser | Adam, learning rate 0.001 then 0.0002 then 0.0001 (cosine decay) | big steps early, small steps late |
| Batch size | 128 | how many drawings per weight update |
| Epochs | 60, then +24, then +26 | one pass over the training data = one epoch |
| Augmentation | shift 5 %, rotate 5 %, random pen thickness and brightness, random zoom 6 % | the network sees more variety than 100 drawings can provide |
| Regularisation | Dropout 0.4, label smoothing 0.05, BatchNorm, EMA weights | stops it memorising and steadies the last epochs |
| Hardware | CPU only, TensorFlow 2.20 | no GPU was needed — about 30 minutes in total |

### 3.4 Why these choices

- **Why 28×28 and not 256×256?** It is the standard Quick, Draw! bitmap size, and it keeps the model at 0.88 MB so it downloads and runs in a browser in about a second. A 96×96 model sees more detail but is several times bigger and slower.
- **Why greyscale?** The data is stored as "how much ink is in this cell", which is exactly a greyscale value. Colour would add information the training data never had.
- **Why white ink on black?** That is the dataset's own convention; the app converts the canvas to match, so training and use see the same thing.
- **Why convolution and not just a big dense layer?** A dense layer on raw pixels would need millions of weights and would not know that an ear moved two pixels is still an ear. Convolutions share one small filter across the whole image, so they are position-independent and cheap.
- **Why Dropout 0.4?** During training 40 % of the 256 judgement neurons are randomly switched off, so the network cannot rely on one path memorising a drawing.
- **Why augment at all?** 100 drawings per class is tiny. Shifting, rotating, thickening and zooming each drawing creates thousands of slightly different examples from the same 100.
- **What is EMA?** Exponential moving average of the weights: instead of keeping the last epoch's weights, keep a running average of recent ones. It is smoother and usually a little more accurate on small data — a large part of my +2.4 points.
- **What is label smoothing?** Train towards 95 % confidence on the right answer and spread 5 % over the rest, instead of towards 100 %. It stops the network becoming over-confident on a tiny dataset.

### 3.5 The improvement experiment

The first model reached 37.71 % top-1. Rather than starting again, I continued training it in two stages and tested whether each stage helped.

| Stage | What changed | Top-1 on the 3,450 test drawings |
| --- | --- | --- |
| Start | first model, 60 epochs | 37.71 % |
| Stage A | 24 more epochs on the training drawings, added random **zoom** (scale) augmentation, label smoothing, learning rate 0.0002 → 5 % | 38.38 % |
| Stage B | 26 more epochs using training **and** validation drawings (31,050 drawings) with EMA weights | **40.09 %** |

**Why zoom?** The network already tolerated shifts, rotations and pen widths, but not the same object drawn bigger or smaller — which is exactly what changes between two people drawing the same thing.

**Why fold in the validation drawings?** After stage A the validation set had been used to choose the best epoch, so it was no longer an unbiased measure. Rather than waste 3,450 drawings, I trained on them and reported the result on the test set only.

**How I know the gain is real, not luck.** Both models were scored on the same 3,450 drawings, so they can be compared drawing by drawing: the new model fixed **169** drawings the old one got wrong and broke **87** that the old one had. A bootstrap over the 345 categories gives a 95 % confidence interval of **+1.42 to +3.36** percentage points, and the McNemar test gives **p = 4.1 × 10⁻⁷** — the chance of that imbalance by luck is about 1 in 2.4 million.

> **The sentence that earns the marks.** I did not just train harder; I changed one thing at a time and proved the change worked. That is the difference between a school project and an experiment.

### 3.6 How the accuracy was measured

| Measurement | Result | How it was done |
| --- | --- | --- |
| Held-out test, 3,450 drawings | top-1 40.09 %, top-3 59.25 %, top-10 77.62 % | Python, on the split the model never trained on |
| App-pipeline benchmark, 400 drawings | 158 / 233 / 257 / 282 (39.5 / 58.2 / 64.2 / 70.5 %) | `scripts/evaluate-quickdraw-400.mjs` replays the app's preprocessing and the exported model |
| Pretrained model, same 400 | 82 / 135 / 162 / 210 (20.5 / 33.8 / 40.5 / 52.5 %) | same script, same drawings — my model is about twice as accurate |
| Sixteen hand-drawn doodles | 6 / 16, 9 / 16, 14 / 16 | `scripts/manual-test-345.mjs`, drawing by hand through the app's code path |
| Chance | 0.29 % | 1 / 345, the score of a blind guess |

## 4. How each tool works

For every tool: what a user sees, what the code actually does, and the sentence to say. The mechanisms are the real ones — constants are quoted from the source files, so you can open the file and point at the line.

### 4.1 Select (the arrow)

**What it does.** Click an object to select it; drag to move; pull the handles to resize or rotate; use the toolbar to flip, recolour, reorder, duplicate or delete. Marquee-drag on empty canvas selects several objects; Shift adds to the selection.

**How it works inside.** Every object in the scene is a record: id, type, centre, size (clamped between 40 and 1100 px), rotation, flip flags, colour and stacking order. Selecting only sets an id list; every gesture is converted from screen coordinates into document coordinates (so zooming does not change what a drag means), applied to the selected objects, and pushed to history as one completed action.

**Say this if asked.** *"Selection is why accepted artwork is a real object and not a screenshot: I can rotate it, recolour it, put it behind something else, and undo all of it."*

### 4.2 Select Doodle (the lasso)

**What it does.** Draw a loop to select everything inside or crossed by it; or scribble across several objects to select them. It never erases, and the dotted outline colour is yours to choose.

**How it works inside.** The stroke is tested to decide whether it is closed: it counts as a loop when its end returns near its start — within 16 screen pixels, or within 15 % of the loop's own bounding-box diagonal (capped at 120 document pixels), because nobody lands exactly on their starting point with a mouse. A closed loop then selects every object whose centre or corners lie inside it, whose outline it crosses, or that contains the loop — plus anything the stroke brushed past. An open stroke is treated as a scribble and selects only the objects it touches (12 px tolerance). Shift keeps the existing selection and adds to it. The outline is drawn as a dashed path over the canvas, not into the drawing.

**Say this if asked.** *"This is the one tool AutoDraw does not have, and it exists because clicking objects one by one is slow when you have drawn a scene."*

### 4.3 Pencil

**What it does.** Draw freehand in the current colour and brush size. Each finished drag becomes one object.

**How it works inside.** Pointer samples are smoothed and drawn into an offscreen ink canvas at the brush size in **logical** pixels, so a 1 px brush really is 1 px at 400 % zoom. When you lift the pen, the stroke's pixels are cut out of the shared ink sheet as their own object with its own bounds, and a recognition pass is scheduled — live passes run every 220 ms while you draw, plus one final pass after the stroke.

**Say this if asked.** *"Brush size is in drawing pixels, not screen pixels — that is why the line does not get thicker when you zoom in."*

### 4.4 Line and Arrow

**What it does.** Drag to draw a straight line or an arrow. When selected, both endpoints have handles you can drag; the arrowhead style, outline width and colour are editable. Shift snaps the angle.

**How it works inside.** These are **parametric** shapes: the object stores two points plus style, and the path is re-rendered from them each frame. Dragging an endpoint rewrites the stored point rather than repainting pixels, which is why it stays perfectly sharp at any zoom.

**Say this if asked.** *"Parametric means it is described by numbers, so editing it is exact — unlike pixels, which would go blurry."*

### 4.5 Rectangle and Ellipse

**What it does.** Drag to draw a rectangle, square, ellipse or circle; edit outline colour and width, fill colour, and the geometry afterwards. Shift constrains it to a perfect square or circle.

**How it works inside.** Same parametric approach as the line: the object stores centre, size, rotation and style, and drawing it is a canvas path call. A hit test uses the shape's geometric outline, so clicking inside a rectangle that is only outlined still selects it.

**Say this if asked.** *"A shape I drew ten minutes ago can still be resized to exact proportions, because nothing was ever flattened."*

### 4.6 Text

**What it does.** Click to place text, type inline, then double-click any text to edit it. Font family (from a safe list), size (10–300 px), weight and alignment are editable, and it moves, rotates, recolours and duplicates like any other object.

**How it works inside.** Text is a structured object holding a string plus style, measured with the canvas text metrics so its bounding box is known for selection and rotation. Editing re-opens an input positioned over the object and commits one history entry when you finish.

**Say this if asked.** *"Text is a scene object, not pixels — which is why it stays crisp when I scale the view and why I can change 'cat' to 'cats' five minutes later."*

### 4.7 Fill (the bucket)

**What it does.** Click inside a closed region to fill it. If the region belongs to one of your objects, the object itself is filled; if you click empty canvas, the fill becomes its own raster layer under the objects.

**How it works inside.** A scanline flood fill with a colour tolerance of 22 units spreads from the clicked pixel across similar-coloured neighbours and produces a mask. That mask is composited either into the target object's own raster (so it stays selectable and movable as one thing) or into a dedicated fill layer beneath all objects. Filling the whole background is a separate control.

**Say this if asked.** *"The tolerance of 22 is why a hand-drawn outline with slightly uneven colour still acts as a wall — the fill stops at it instead of leaking everywhere."*

### 4.8 Eraser — two modes

**What it does.** Classic: rubs out sketch ink and removes any object the stroke crosses. Doodle mode: a soft brush that trims pixels off illustrations, text and leftover sketch in real time, keeping whatever survives as a normal editable object.

**How it works inside.** Classic mode uses hit tests against the objects under the stroke. Doodle mode renders the object to an offscreen canvas at 2× the display resolution, paints a circular mask along the pointer path, discards pixels (anything below alpha 8 counts as gone), and then splits the remaining ink into connected blobs. Any blob with at least 12 pixels becomes its own object — so erasing the middle of a doodle leaves two separate, still-movable pieces.

**Say this if asked.** *"That is why erasing never destroys the object model: the survivor is re-measured and put back in the scene, and there is a 12-pixel floor so a stray eraser touch does not leave invisible ghosts."*

### 4.9 Zoom and Pan

**What it does.** Wheel zoom from 25 % to 400 % anchored at the pointer, step buttons, and a reset. Pan with Space + drag or the Hand tool.

**How it works inside.** The view keeps a zoom factor and a pan offset; screen coordinates are converted to document coordinates through that transform on every input event. Zoom steps are 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3 and 4. Wheel zoom is registered as a non-passive listener so it can block the browser's page zoom.

**Say this if asked.** *"Zoom and pan are view-only: they never touch the document, so they do not appear in undo history and they cannot damage a drawing."*

### 4.10 Undo and redo

**What it does.** Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redoes. It covers sketching, erasing, text, artwork edits, fills, background changes and clear.

**How it works inside.** A bounded history of 24 snapshots (deep copies of the object list plus background and layer state). Every completed action pushes one snapshot; undo moves a cursor back and restores a copy, redo moves it forward. Because snapshots are whole-scene copies, undo cannot leave a half-applied edit behind.

**Say this if asked.** *"Twenty-four steps is a deliberate trade-off between memory and how far back a user actually wants to go."*

### 4.11 The Guessing switch, and the suggestion strip

**What it does.** One switch turns AI suggestions on or off. Off hides the panels and stops inference entirely, while all drawing tools keep working; the choice is remembered on that device. On reloads the model and checks the current sketch.

**How it works inside.** When on, predictions are built from the model's top 10 classes: up to 12 cards, one artwork per class plus a second variant where one exists, and identical artwork is never shown twice (clock and alarm clock share a drawing). Cards are ordered by probability and carry the confidence, so the panel says "AI thinks you might be drawing… Cat 54 % / Dog 31 %" instead of claiming certainty.

**Say this if asked.** *"The strip is the actual product decision: a 40 % top-1 model is only useful if the right card is usually somewhere on the bar, which is measured at 77.6 % top-10."*

### 4.12 Also worth knowing

- **Thickness adjustment:** a signed adjustment with an explicit Apply, which affects hand-drawn marks, parametric shape strokes and outlined artwork — but deliberately leaves solid filled artwork and text alone.
- **Layers:** objects reorder one step at a time, and duplicated objects land 20 px offset so they are visibly on top.
- **No PNG export:** a design decision, not a missing feature — the project keeps everything editable instead of flattening it into a picture.
- **No server:** no account, no API key, no analytics; the drawing never leaves the browser, which is also the easiest answer to any privacy question.

## 5. The live demo, minute by minute

Practise this four times. Before you start: open the app, draw one small stroke, wait for the card strip to appear, then clear. That way nothing is downloading while he watches.

| Time | You do | You say |
| --- | --- | --- |
| 0:00 | stand, app already open | "Google's AutoDraw turns a rough sketch into a clean drawing. This is my own version, and the AI in it is a network I trained myself on Google's Quick, Draw! data — not Google's model." |
| 0:15 | draw a sun: circle plus eight short lines | "It looks at the canvas about five times a second and shows its ten best guesses with confidence, not one confident answer." |
| 0:45 | click the sun card, then drag, rotate, recolour it | "The suggestion is not a pasted picture — it becomes an editable object with handles, like everything else on the canvas." |
| 1:05 | draw a cat: head, ears, whiskers, tail | "When it is unsure it says so: cat 47 %, pig 35 %, bear 5 %. That honesty is deliberate." |
| 1:35 | draw a tree, let it miss | "This is where it fails — trees come out as hot-air balloons. My measured accuracy is 40 % for the first guess and 78 % for the right answer being anywhere in the cards, so I expect misses. I have a 400-drawing test that tells me exactly how often." |
| 2:05 | show the numbers page (section 8) | "On 3,450 drawings it never saw: 40 % top-1, 59 % top-3, 78 % top-10. I then improved it by 2.4 points with one specific change — teaching it about scale — and proved the gain with a statistical test, p = 4 × 10⁻⁷. Against a pretrained doodle model on the same 400 drawings mine scored 39.5 % and that one 20.5 %." |
| 2:45 | close | "It runs fully in the browser: no server, no API key, 0.88 MB model. There are 274 automated checks on the app, and every accuracy number can be regenerated with the scripts in the project." |

### 5.1 What to draw, and what not to

| Safe demo objects | Why they work | Avoid unless you are making the honesty point |
| --- | --- | --- |
| sun, car, cat, flower, lion, fish, house | visually distinctive, and strong in the confidence table (sun ~87 %, car ~67 %, cat ~47 % top-1 with pig close behind) | tree, airplane, umbrella, train, guitar, elephant — these currently miss, and the umbrella was a top-1 hit before the refinement |

**Drawing tip:** draw large (a third of the canvas) and keep the strokes connected. The model was trained on compact doodles; a tiny wobbly sketch in one corner is the hardest possible input, and the preprocessing will stretch it unpredictably.

## 6. Fifty-seven questions you can be asked

Grouped by what the examiner is really testing. Read every answer once, out loud, then close the page and say it in your own words. Two sentences is enough; a memorised paragraph sounds worse than an honest short one.

### A. About the idea (testing whether you understand what you built)

**Q1. What exactly is this project?**
A browser drawing app that recognises 345 kinds of doodles in real time and offers clean illustrations to replace the sketch. The classifier is a neural network I trained myself on 34,500 public drawings, and the accepted illustration stays editable.

**Q2. Did you copy AutoDraw?**
No. AutoDraw is Google's closed product and I have not seen its code or weights. What I copied is the *idea*. I trained my own network on the public Quick, Draw! dataset, which is a separate, openly licensed thing.

**Q3. Why build this when AutoDraw already exists?**
Three reasons: it was the challenge given to me; it shows a complete AI pipeline from raw data to a running product; and my version runs entirely offline with no server, which AutoDraw cannot do.

**Q4. What is the single hardest part of the project?**
Making training and real use see the same image. The model is trained on 28×28 white-on-black bitmaps drawn with a thick pen; a browser pen is thin and my canvas is 1200×720. Matching the geometry and the ink brightness is what made recognition work at all.

**Q5. What would you do differently if you started again?**
Get more data first, before touching the architecture. With 100 drawings per class I am training at the limit of what that data can teach; with 5,000 per class the same code would do far better.

**Q6. Is this actually useful to anyone?**
It is useful as a demonstration and as a drawing tool for simple objects. It is honest about its uncertainty, works offline, and needs no account — which is a real advantage in a school computer lab.

### B. How the AI works (the technical core)

**Q7. What is a neural network, in one sentence?**
A stack of layers of numbers where each layer transforms its input, and the numbers inside it (the weights) are adjusted during training until the final output matches the right answers.

**Q8. What does your network take as input?**
A 28×28 grid of brightness values, one channel, 0 to 1, with the drawing as white ink on a black background. Nothing else — no colour, no stroke order, no canvas size.

**Q9. Is the input 28×28 or 96×96? I heard it changed.**
The shipped model has always been 28×28 — you can read `[null, 28, 28, 1]` in `public/model-345/model.json`. The 96×96 items are separate: the 333-class archive supplied to me is 96×96 and ships disabled because its label order is unverified (it only loads with an environment flag), and `training/kaggle_train_96.py` is a script for training a future 96×96 model on Kaggle. Neither is in the app's working path, and I do not claim any accuracy from them.

**Q10. What comes out?**
345 numbers between 0 and 1 that add up to 1 — one probability per category. The app takes the ten largest and turns them into suggestion cards.

**Q11. What is a convolution layer actually doing?**
A small 3×3 filter slides across the image and responds strongly wherever it sees the pattern it has learned — an edge, a curve, a corner. Thirty-two filters in layer one means thirty-two patterns are detected. Stacking layers builds bigger patterns out of small ones.

**Q12. Why three convolution layers and not thirty?**
Because there are only 34,500 training drawings. A deeper network would memorise them and score worse on drawings it has not seen. 214,649 parameters is about the right size for this much data.

**Q13. What is BatchNorm and why is it there?**
It re-scales each layer's activations to a stable range during training, which makes learning faster and less sensitive to the learning rate. It also stores running averages that are applied at inference time.

**Q14. What does ReLU do?**
It replaces negative numbers with zero and leaves positives alone — a cheap non-linearity. Without non-linearities the whole stack would collapse into one big linear function.

**Q15. What is GlobalAveragePooling for?**
It averages each of the 128 feature maps into one number, turning a 7×7×128 block into 128 numbers. That makes the decision independent of where in the image the evidence was found.

**Q16. What is softmax?**
The function that turns the last layer's raw scores into probabilities: it exponentiates them and divides by their sum, so everything is positive and adds to 1. The percentages in the app come from it.

**Q17. What is dropout?**
During training, 40 % of the 256 judgement neurons are randomly switched off at each step, so the network cannot depend on one path memorising a specific drawing. At inference all neurons are used.

**Q18. What is an epoch, and what is a batch?**
An epoch is one full pass over the training data. A batch is the group of 128 drawings used for one weight update, so one epoch is 27,600 / 128 ≈ 216 updates.

**Q19. What is the learning rate and why did it change?**
How far each weight moves per update. I start larger (0.001, later 0.0002) for fast progress and decay it (down to 0.0001) so the last epochs fine-tune instead of bouncing around.

**Q20. What is loss?**
A single number measuring how wrong the predictions are — cross-entropy here. Training is minimising it. A loss of 2.7 across 345 classes means the model is far from certain, which is honest.

**Q21. What is overfitting, and how did you avoid it?**
Memorising training drawings instead of learning shapes: training accuracy climbs while test accuracy falls. I avoided it with dropout 0.4, augmentation, label smoothing, early stopping on validation data and EMA weights — and by always quoting the test number, never the training number.

**Q22. What is augmentation and which kinds did you use?**
Making extra training examples from the ones you have: I shift each drawing by up to 5 %, rotate it by up to 5 %, randomly thicken, thin or brighten the strokes, and zoom it by up to 6 %. The pen-thickness and zoom ones were my additions.

**Q23. Why is pen thickness augmentation so important here?**
Quick, Draw! strokes are about 1.5 px wide on the 28×28 grid; a browser pen at my canvas size comes out three to five times thinner and paler. Without training on different thicknesses the model scored well on clean test data but failed on real doodles.

**Q24. What does the confidence percentage mean — is 54 % reliable?**
It is the softmax score, the model's own ranking strength, not a calibrated probability. It is reliable for ordering the cards, which is what the app uses it for, and the panel is worded as "might be drawing" for exactly that reason.

**Q25. What is top-1, top-3 and top-10 accuracy?**
The share of test drawings where the correct answer is in the first 1, 3 or 10 predictions. Mine are 40.09 %, 59.25 % and 77.62 % on 3,450 held-out drawings.

**Q26. Why report all three instead of just one?**
Because the app shows ten cards. Top-1 measures the model's sharpness; top-10 measures what the user can actually find on the bar. Quoting only the flattering one would be misleading.

**Q27. What is the train / validation / test split and why does it matter?**
27,600 drawings to learn from, 3,450 to choose settings and stopping points, 3,450 kept completely untouched to measure the result. If I measured on the training drawings the score would be meaningless, because the model has already seen them.

**Q28. Why did you use the validation drawings for training in the end?**
Once they had been used to pick the best epoch they were no longer an unbiased measure, so training on them was free data. I then reported the result on the test set only.

**Q29. What is EMA and why did it help?**
Exponential moving average — keep a running average of the weights instead of only the last update. On small datasets the average is more stable and generalises slightly better; it was a large part of my +2.4 point improvement.

**Q30. How do you know your improvement is not luck?**
Both models were scored on the same 3,450 drawings, so I compared them drawing by drawing: the new one fixed 169 and broke 87. A bootstrap confidence interval on the gain is +1.42 to +3.36 points, and McNemar's test gives p = 4 × 10⁻⁷.

**Q31. What is a p-value?**
The probability of seeing a difference at least this large if there were actually no difference. 4 × 10⁻⁷ means about 1 in 2.4 million — small enough that I treat the improvement as real rather than noise.

### C. The app and its tools (testing whether you wrote this or just ran it)

**Q32. Why does the app show ten suggestions instead of one?**
Because a 40 % top-1 model is only useful if the right answer is usually somewhere on the bar — and it is, 77.6 % of the time. Ten classes also means the strip is filled with different objects rather than twelve versions of one guess.

**Q33. How often does it predict while I draw?**
Every 220 ms, plus one final pass after you lift the pen. Anything under 240 ink pixels or a 16 px span is ignored as accidental.

**Q34. What is the hardest preprocessing detail?**
The 1.186 crop padding and the ink brightness lift (97th percentile to 0.9). Google rendered its bitmaps with a 16 % margin and a thick pen; my canvas has neither, so I reproduce the margin and repair the paleness with a gamma curve.

**Q35. Why is brush size in logical pixels, and why does that matter?**
Because otherwise a 1 px line would become 4 px at 400 % zoom. Screen coordinates are converted to document coordinates before anything is drawn.

**Q36. How does the doodle eraser keep the rest editable?**
It re-renders the object at 2× resolution, paints a mask along the stroke, drops pixels below alpha 8, then splits the survivors into connected blobs. Each blob with at least 12 pixels becomes a new object with its own bounds.

**Q37. How does the bucket fill know where to stop?**
A flood fill with a tolerance of 22 colour units: neighbours within that distance of the clicked colour are filled. Your outline is different enough from the background that it acts as a wall.

**Q38. What makes the shapes different from drawing pixels?**
They are parametric — stored as numbers (endpoints, centre, size, rotation, style) and drawn by a canvas path call each frame. Editing rewrites the numbers, so it stays sharp at any zoom.

**Q39. Why is undo limited to 24 steps?**
Each step is a full copy of the scene, so the limit is a memory trade-off. Undo is snapshot-based, which is why an edit can never be left half-applied.

**Q40. What happens if the 345-class model fails to load?**
The app falls back to the bundled 100-class model and the header says which model is active. The supplied 333-class model is only enabled by an environment flag because its label order is unverified.

**Q41. What does the AI switch actually stop?**
Model loading and all inference. The drawing tools keep working, the panels hide, and the preference is remembered on the device.

### D. Evidence and engineering (testing whether the claims are checkable)

**Q42. How do I know these numbers are not made up?**
Every one is produced by a script in the project: Python for training and measurement, and node scripts that replay the app's own preprocessing. The split and seed are recorded inside the model's manifest file, so the test drawings are fixed.

**Q43. What is your test set, exactly?**
3,450 drawings — 10 per class out of 100 — chosen by a fixed permutation with seed 42, never trained on, and scored once at the end.

**Q44. How long does training take?**
About 30 minutes in total on a normal CPU without a GPU: 15 minutes for the first version, then 7 and 8 minutes for the two refinement stages.

**Q45. How big is the model, and why does that matter?**
214,649 parameters, 0.88 MB in the browser format. That is small enough to load in about a second on a school laptop, which is why the app can run fully offline.

**Q46. What are the 274 automated checks?**
A node script that drives the app's real logic: drawing, selection, erasing, fills, zoom and pan, shape geometry, layer order, undo. All 274 pass, and they are what let me change the model and the tools without breaking behaviour.

**Q47. When you changed the model, how did you know the app still worked?**
The browser asset is verified against the Keras model before it is installed: the two must agree to better than 1e-4 in every output (mine agree to 2.7 × 10⁻⁷). Then the 400-drawing benchmark is re-run through the app's own code path, and the 16 hand-drawn doodles are re-checked.

**Q48. Where does the illustration artwork come from?**
A curated library shipped with the project, including openly licensed icon sets; each category maps to one or more drawings. The dataset is credited under CC BY 4.0 and the attribution files ship with the app.

**Q49. Is the dataset legal to use?**
Yes — Google released Quick, Draw! under CC BY 4.0, which allows reuse with attribution. The project ships an `ATTRIBUTION.txt` with the model and names the source in the report.

### E. Awkward questions (answer these plainly; hesitating costs more than the fact)

**Q50. Only 40 %? That is below half.**
Yes, for a single guess — 345 categories from a 28×28 black-and-white thumbnail is very little information, and I had 100 training drawings per class. But the app does not show one answer: the correct object is in the ten cards 78 % of the time. I report both numbers rather than only the flattering one.

**Q51. So it is not as good as AutoDraw.**
Not yet. AutoDraw was built by a team at Google with the full 50-million-drawing dataset; mine is trained on 34,500 drawings by one student on a CPU. On the same 400 drawings my model beat a pretrained third-party doodle model nearly two to one, which is the comparison I can actually defend.

**Q52. Did someone else write this? Did you use AI to help?**
Be direct and specific: say exactly what help you had (for example code assistance, review, or a teacher's guidance), then say what you did and can explain — the dataset preparation, the training runs, the measurements, the experiment that produced the +2.4 points. Then offer to open any file and explain it. Never say "I don't know, the AI wrote it": that is the one answer that loses marks. The full declaration is in section 12.2.

**Q53. Why should I believe the percentages if the model is often wrong?**
The percentage is a ranking signal, not a guarantee, and the app words it that way — "AI thinks you might be drawing". What matters is whether the right card is on the bar, and that is measured at 78 %.

**Q54. What happens if it fails during the presentation?**
Say what is happening and keep going: draw larger, keep the strokes connected, and if it still misses, use it as the honesty point — the measured 40 % predicts misses, and the failure cases are in the report. A missed guess is not a broken demo.

**Q55. Is an offline browser app really an achievement?**
The app part is not the hard part. The hard part is that the AI in it was trained from raw public data, evaluated properly, and then improved by a measured experiment — and that the whole pipeline is reproducible from the project files.

**Q56. What is the biggest weakness of the project?**
Data. 100 drawings per category against 50,000 available. Everything else — architecture, augmentation, training recipe — is already near the limit of what that data can teach, which is exactly what my experiments showed.

**Q57. What would full marks look like to you?**
A working app, a model I trained and measured myself, an improvement I proved rather than claimed, and a report where every number can be regenerated. Whether that is 50 out of 50 is your decision, not mine — but there is nothing here I cannot explain or reproduce.

## 7. If something goes wrong

| What you see | What to do | What to say |
| --- | --- | --- |
| Model still loading ("loading" in the header) | wait up to 30 s; the 0.88 MB asset loads from the site itself, so no internet is needed once the page is open | "It is loading the 214,649-parameter network into the browser — it runs locally, nothing is sent to a server." |
| No suggestion cards appear | draw bigger and connect the strokes; the app ignores sketches under 240 ink pixels | "It deliberately does not guess from a stray mark — there is a minimum ink threshold so the panel is not noise." |
| Confidence is low (10–20 %) | add a detail: wheels to a bus, a tail to a cat, a handle to a cup | "Low confidence means the evidence is ambiguous, which is the honest output — adding a distinguishing feature is how you steer it." |
| It recognises the wrong object | do not fight it; point at the strip, the right card is often there | "Top-1 is right 40 % of the time, but the right object is on the bar about 78 % of the time — that is why the strip exists." |
| Page was reloaded / app is down | use the printed numbers page and the report | "I have the full report and every measurement with me; the figures do not depend on the demo working." |
| Examiner asks something you truly do not know | say what you do know, then say what you would check | "I do not know that off-hand. What I know is how it is measured — and it is written in the report, so I can show you the exact method." |

## 8. The numbers card

Print this page and keep it on the table. These are the only numbers you need to remember, and every one is defensible.

| Number | Value | If asked to explain |
| --- | --- | --- |
| Classes | 345 | the full official Quick, Draw! category list |
| Training drawings | 34,500 | 345 classes × 100 drawings each |
| Split | 27,600 / 3,450 / 3,450 | train / validation / test, seed 42 |
| Input | 28 × 28 × 1 | greyscale, white ink on black, 0 to 1 |
| Parameters | 214,649 | learned numbers in the network |
| Model size | 0.88 MB | browser asset, loads in about a second |
| Training time | ~30 min | CPU only, no GPU: 15 + 7 + 8 |
| Top-1 (held-out) | 40.09 % | first card correct, 3,450 unseen drawings |
| Top-3 | 59.25 % | correct card in the first three |
| Top-10 | 77.62 % | correct card anywhere in the strip |
| Chance | 0.29 % | 1 in 345 — so about 140× better than guessing |
| Improvement | +2.38 points | from the refinement experiment, p = 4 × 10⁻⁷ |
| App benchmark | 158/400 | 39.5 % top-1 through the app's own pipeline |
| Pretrained baseline | 82/400 | 20.5 % — my model is about twice as accurate |
| Hand-drawn doodles | 6/16, 9/16, 14/16 | sixteen doodles I drew; tiny sample |
| Automated checks | 274 | app behaviour tests, all passing |
| Recognition cadence | 220 ms | live predictions while drawing |

## 9. Glossary

| Word | What it means here |
| --- | --- |
| Model | the trained network file — the 0.88 MB that makes predictions |
| Weight | one learned number inside the model; 214,649 of them |
| Parameter | same as a weight (plus biases); used interchangeably here |
| Epoch | one full pass over the training drawings |
| Batch | the 128 drawings used for one weight update |
| Learning rate | how large each weight update is allowed to be |
| Loss | a number saying how wrong the predictions are; training reduces it |
| Convolution | a small filter slid across an image to detect a pattern |
| Feature map | the output of one filter — where in the image it responded |
| Pooling | shrinking a feature map by taking maxima or averages |
| Softmax | turns raw scores into 345 probabilities that sum to 1 |
| Dropout | randomly disabling neurons during training to prevent memorising |
| BatchNorm | normalising a layer's activations so training is stable |
| Augmentation | making extra training examples by shifting, rotating, zooming, re-thickening |
| Overfitting | memorising training drawings so test accuracy suffers |
| Top-k accuracy | correct answer within the first k predictions |
| Held-out / test set | drawings never used in training, used once to measure |
| Inference | using a trained model to predict — what the browser does |
| TensorFlow.js | the library that runs the network inside the browser |
| EMA | exponential moving average of weights — a steadier end-of-training model |
| Bootstrap / McNemar | statistical tests used to show the improvement is real |

## 10. Proof and file map

If an examiner wants to check a claim, these are the commands. Node scripts need `npm install` once; the Python scripts need TensorFlow.

| Command | What it proves |
| --- | --- |
| `node scripts/audit-app.mjs` | 274 automated checks of the real app logic |
| `node scripts/manual-test-345.mjs` | the 16 hand-drawn doodles through the real browser code path |
| `node scripts/evaluate-quickdraw-400.mjs --data-dir <drawings> --manifest training/evaluation-400-manifest.json` | the 400-drawing comparison against the pretrained model |
| `python training/refine_model_345.py --checkpoint <weights> --out <dir>` | the refinement experiment: two stages, then the paired test |
| `python training/export_model_345.py --weights <model>` | the Keras → TensorFlow.js export, including the parity check against Keras |
| `python docs/submission/build-handbook.py` | rebuilds the PDF version of this handbook from the repository's numbers |

### 10.1 Where things are

| Path | What is in it |
| --- | --- |
| `public/model-345/` | the shipped model, its 345 labels and a manifest recording the split, seed, architecture and scores |
| `src/ai/preprocess.js` | crop, square, resize, polarity and contrast constants |
| `src/ai/model.js` | model loading and the fallback order |
| `src/lib/suggestions.js` | how predictions become the 12 suggestion cards |
| `src/lib/scene.js` | objects, shapes, text, transforms, thickness, layers |
| `src/lib/doodle-eraser.js` | the pixel eraser and ink splitting |
| `src/lib/raster-fill.js` | the flood fill |
| `src/lib/selection-doodle.js` | closed-loop and scribble selection |
| `training/model-345-refinement-2026-11-20.md` | the improvement experiment, in full |
| `training/evaluation-400-results.md` | the 400-drawing comparison, in full |
| `docs/submission/presentation-handbook.md` | this handbook as editable Markdown (the source) |
| `docs/submission/build-handbook.py` | the layout script that renders this handbook to PDF |
| `docs/submission/project-report.md` | the written report for submission |
| `training/backup/*.zip` | the model archives, with checksums |

## 11. Technologies, data and tools — and why each was chosen

Every row below was a choice between at least two options. The third column is the reason, in the form you can repeat out loud: what it does, and what the alternative would have cost.

| Technology | What it does here | Why this one, and not the alternative |
| --- | --- | --- |
| **React 18 + Vite 6** | builds the editor UI (tool rail, selection toolbar, suggestion strip, panels) and bundles the app into static files | the editor has a dozen interacting modes (tool, selection, marquee, text editing, mask) and React keeps that state in one place; Vite gives instant reload while developing and a static build with no server. Plain JavaScript would have become hundreds of manual DOM updates; webpack/CRA would only be slower |
| **HTML Canvas 2D** | all drawing: ink strokes, shapes, text, fills, erase masks, object rendering | the AI needs pixel access (`getImageData` to find ink), and the eraser and bucket fill work on pixel masks. SVG would mean thousands of DOM nodes and no pixel operations; a WebGL scene graph would be far more code for no benefit at this scale |
| **TensorFlow.js 4.22** | loads the model in the browser and runs each prediction | the only mature way to run a Keras CNN fully client-side, on WebGL or CPU, with no backend. Server inference needs a backend and sends the drawing away; a native mobile app is not a browser project |
| **Python + TensorFlow 2.20 / Keras 3** | builds and trains the 345-class network; augmentation layers | the standard CNN training stack, with RandomZoom/RandomTranslation built in and an official converter to TensorFlow.js. PyTorch would train equally well but its export path to a TF.js layers model is less direct; scikit-learn cannot train a CNN |
| **CPU-only training** | 30 minutes total for 60 + 24 + 26 epochs | 34,500 drawings is small enough that a GPU adds nothing but setup risk, and no GPU was available. Staying on CPU means the whole experiment is reproducible on any school laptop — a claim you can repeat, not a boast |
| **NumPy memory-mapped cache** | stores the 34,500 drawings as one `.npy` file per class, read on demand | keeps RAM flat and loading instant, so the training loop is not waiting on 34,500 small file reads. Loading everything into Python lists would have been simpler and much slower |
| **tensorflowjs_converter** | Keras model to the browser asset (`model.json` + weight shard) | the official, only supported conversion path from Keras to a TF.js layers model. It needed two documented fixes (`batch_shape`, weight-name prefix), which is why the export is a script and not a one-off command |
| **Google Quick, Draw! dataset** | 34,500 drawings, 345 official categories, 100 per category | openly licensed (CC BY 4.0), matching the task exactly, and the same data AutoDraw's idea is built on. The full 50-million-drawing release was unreachable from the training machine; the quickdraw.js npm mirror is a verbatim copy but stops at 100 drawings per class — the project's biggest limitation |
| **Icon sets** (Game-icons, Lucide, MDI, Tabler, Font Awesome, Iconoir) | the clean illustrations offered on the suggestion cards | 345 hand-drawn illustrations were impossible in the time available, and these sets are openly licensed and consistent in style. Every one is credited in the shipped attribution files |
| **DM Sans / DM Serif Display** via `@fontsource` | typography of the app UI | self-hosted, so the page makes no third-party font request and works offline — which is the whole point of a tool that must run in a school lab without internet |
| **Node.js + @napi-rs/canvas + jsdom + resvg** | the 274 automated checks and the 400-drawing benchmark | they run the app's real functions (`preprocess.js` reads a canvas `getImageData`) outside a browser, so the tests exercise the code the user runs, not a reimplementation. Headless Chrome would be heavier and slower for the same evidence |
| **Git + GitHub** | version history, experiments, pull requests, model versions | every experiment is reversible: if a training change made the model worse, the previous weights are one checkout away. The model itself is committed on purpose, because regenerating it takes 30 minutes and a trained model has been lost before |
| **Google Drive** | the 333-class and 96×96 model archives supplied for evaluation | it was where the archives actually were, so the evaluation pipeline was pointed at them. They were measured, compared and rejected with reasons — the comparison is in the report rather than an opinion |
| **reportlab** (Python) | generates the PDF version of this handbook | the document is built from the repository's own numbers (layer shapes are read from `model.json`), so it cannot drift out of date the way a hand-typed Word file does. Pure Python, no system libraries, one command to rebuild |
| **Arena.ai Agent Mode** (AI assistant) | pair-programming partner: implementation, training runs, evaluation, documentation | declared in full in section 12.2. Recorded here because it was used exactly like the tools above — to produce this project — and saying so plainly is part of submitting it honestly |

### 11.1 Why not the obvious alternatives

- **Why not use Google's AutoDraw or Quick, Draw! model?** It is not published — there is no API and no weights to download. Using someone else's model would also mean the accuracy is not mine to report.
- **Why not send the drawing to a server?** It would need a backend, an API key and an internet connection, and the drawing would leave the device. The requirement was a tool that works in a school lab with no server.
- **Why not a deeper or wider network?** With 100 drawings per class a bigger network memorises instead of learning. That is a measured risk, not a guess: the 400-drawing benchmark is exactly the instrument that would show it.
- **Why not switch to 96×96 now?** Tried and documented: the 96×96 archive available to me has an unverified label order, so it is disabled; a 96×96 model trained properly is future work, and it makes the asset several times bigger and each live prediction slower.
- **Why not train in JavaScript, in the browser?** Training in TensorFlow.js is CPU-bound and would take hours on the same data, with no augmentation pipeline and no reproducible seeds. Python trains it in 30 minutes and produces a 0.88 MB file.
- **Why not an SVG-only editor?** Because the AI needs pixels. Ink masks, the flood fill and the eraser's connected-blob splitting all operate on raster data.

## 12. Sources, links and AI assistance

### 12.1 Where each piece came from

| Source | Used for |
| --- | --- |
| https://github.com/googlecreativelab/quickdraw-dataset | the dataset, its licence (CC BY 4.0) and the 28×28 bitmap format |
| https://github.com/googlecreativelab/quickdraw-dataset/issues/19 | the exact cairo settings Google used to render the bitmaps (pen width, padding) — the reason the 1.186 crop padding and ink lift exist |
| https://www.npmjs.com/package/quickdraw.js | the npm mirror the drawings were actually downloaded from (100 per class) |
| https://www.tensorflow.org/ and https://keras.io/ | training API, augmentation layers, optimisers, EMA |
| https://www.tensorflow.org/js | running the model in the browser, `loadLayersModel`, the converter |
| https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API | canvas drawing, `getImageData`, transforms, text metrics |
| https://react.dev/ and https://vite.dev/ | UI components and the static build |
| https://www.autodraw.com/ | the idea being copied — not the code |
| game-icons.net, lucide.dev, materialdesignicons.com, tabler.io, fontawesome.com, iconoir.com | the suggestion artwork, all credited in the app's attribution files |
| https://fontsource.org/ | self-hosted DM Sans and DM Serif Display |
| https://github.com/nileshwarke848-droid/SketchAI | this repository: code, experiments, model archives and the reports |

### 12.2 Statement of AI assistance

> **Declaration included in the submitted report.** This project was developed with an AI coding assistant (Arena.ai Agent Mode) working as a pair-programming partner under my direction. The assistant wrote a large part of the implementation code and documentation, and carried out the training and evaluation runs. I defined the project and its requirements, chose what to build and what to keep, tested the application, reviewed the results, and made the decisions recorded in this report.
>
> Everything I claim here is something I can explain and demonstrate: the dataset and its split, the preprocessing pipeline, the network's architecture, why each augmentation exists, how the accuracy was measured, and why the +2.4-point improvement is statistically real. Every figure can be regenerated from the project's scripts. No weights came from Google, AutoDraw or any third-party checkpoint — the model was trained inside this project on Google's open Quick, Draw! data.

Why declare it at all: the school's own guidance asks it to satisfy itself that the project is the learner's work, and a declaration that turns out to be false is far worse than "I had help with the code, and here is what I understood and verified". Two rules make the declaration safe:

- **Be exact about the split of work.** Say which parts were generated and which parts you personally checked, changed or measured — vagueness in either direction is what examiners probe.
- **Never claim something you cannot explain.** If a sentence here describes code you cannot walk through, either learn it from the file or delete the sentence. That is question Q52 of section 6, and it is the one that actually decides the viva.

> **The closing line.** If you remember nothing else: 40 % first guess, 78 % somewhere in the strip, +2.4 points proved with a statistical test, and every number regenerable from the project. Say that slowly and you have answered the challenge.
