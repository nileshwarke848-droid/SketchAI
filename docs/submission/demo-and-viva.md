# SketchAI — demo script and viva preparation

Two things decide the marks now: **what the principal sees in three minutes**, and
**what you can answer when he asks why**. Accuracy is already measured; this file
is about presenting it.

---

## 1. The three-minute demo

Practise this four times before the day. Have the page already open and the model
loaded (open the app, draw one stroke, wait for the card strip) so nothing is
downloading in front of him.

**0:00 — the one-line pitch (15 s).**
> "Google's AutoDraw turns a rough sketch into a clean drawing. This is my own
> version. The AI in it is a neural network I trained myself on Google's Quick,
> Draw! data — it isn't Google's model."

**0:15 — draw a sun (30 s).** Circle plus eight lines. It appears at ~85–90 %
confidence within a second.
> "It looks at the canvas about five times a second and shows its ten best
> guesses with confidence, not one confident answer."

**0:45 — accept a suggestion (20 s).** Click the sun card. Then drag it, rotate
it, resize it, change its colour.
> "The suggestion isn't a pasted picture — it becomes an editable object with
> handles, like everything else on the canvas."

**1:05 — draw a cat (30 s).** Head, ears, whiskers, tail. Cat is usually top — but
pig and bear will be right behind it.
> "When it's unsure, it says so: cat 47 %, pig 35 %, bear 5 %. That honesty is
> deliberate."

**1:35 — show a hard one, and be honest (30 s).** Draw a tree or an airplane.
It will probably miss.
> "This is where it fails — trees come out as hot-air balloons. My measured
> accuracy is 40 % for the first guess and 78 % for the correct answer being
> somewhere in the ten cards, so I expect misses. I have a 400-drawing test that
> tells me exactly how often."

**2:05 — show the evidence (40 s).** Open `training/model-345-refinement-2026-11-20.md`
or the numbers table on your phone/printout.
> "I measured it on 3,450 drawings it never saw: 40 % top-1, 59 % top-3, 78 %
> top-10. I then improved it by 2.4 points with a specific change — teaching it
> about scale — and proved the gain was real with a statistical test, p = 4 × 10⁻⁷.
> I also compared it with a pretrained doodle model on the same 400 drawings: mine
> scored 39.5 %, that one 20.5 %."

**2:45 — close (15 s).**
> "It runs fully in the browser with no server and no API key — 0.88 MB model.
> There are 285 automated checks on the app (`npm test`) and every accuracy number in the
> report can be regenerated with the scripts in the repository."

**Objects that work well in a demo (practise these):** sun, car, cat, flower,
lion, fish, house. **Objects that currently fail:** tree, airplane, umbrella,
train, guitar, elephant. Never demo with those unless you are making the honesty
point.

---

## 2. Be ready to say what help you took

The viva exists to check the work is yours. If a teacher helped, or you used an
AI assistant to write code or the report, **say so plainly** and say what you
yourself did and can explain. Principals mark down "I don't know, someone else
wrote it" far harder than "I used help for the code, and here is what I
understood and verified". Before the viva, be able to explain, in your own words:

- what the 28 × 28 × 1 input is and why the canvas is converted to it;
- why the network has convolution layers and what they detect;
- what softmax and the confidence percentages mean;
- what train / validation / test split means and why the test set is touched once;
- what your zoom-augmentation experiment changed and what it proved.

If you cannot explain a piece, either learn it from the report or remove that
claim from the report. Do not submit a sentence you cannot defend.

---

## 3. Twenty questions he is likely to ask

**1. Is this AutoDraw? Did you copy Google's model?**
No. AutoDraw is Google's closed product. I trained this network myself on the
public Quick, Draw! dataset, which is a different thing — the dataset is open
(CC BY 4.0), Google's trained model is not. Every weight in my model file came out
of my own training run.

**2. What is the accuracy?**
40 % for the first suggestion, 59 % within the top 3, 78 % somewhere in the ten
suggestions, measured on 3,450 drawings the model never saw. Guessing would give
0.29 %.

**3. Only 40 %? That's below half.**
For a single guess, yes — 345 categories from a 28 × 28 black-and-white thumbnail
is very little information, and I only had 100 training drawings per category.
The product doesn't show one answer; it shows ten cards, and the correct object
is in those ten about 78 % of the time. I report both numbers rather than only
the flattering one.

**4. Why 28 × 28 pixels?**
Because that is the standard Quick, Draw! bitmap size, and a model this small
(0.88 MB) downloads and runs inside a browser in a second. A 96 × 96 model would
see more detail but be several times bigger and slower — I list that as future
work.

**5. Why greyscale, white ink on black?**
The dataset is stored as "how much ink is in this cell", which is exactly a
greyscale value; colour would add information the training data does not have.
The app converts the odd look of white-on-black to match training exactly.

**6. What is a convolution?**
A small filter (3 × 3 pixels) that slides over the image and responds to patterns
like edges and curves. Stacking them builds parts (wheels, ears) and then whole
objects.

**7. What is softmax?**
A function that turns the last layer's raw scores into 345 positive numbers that
add up to 1, i.e. probabilities. The percentages shown in the app come straight
from it.

**8. What is overfitting, and how did you avoid it?**
Memorising the training drawings instead of learning the shapes — training
accuracy rises while test accuracy falls. I used dropout 0.4, augmentation,
early stopping on the validation set, label smoothing and EMA weights, and I
always report the test number, never the training number.

**9. What was your own contribution, beyond training?**
Two things. First, pen-width augmentation: browser pens are much thinner than
Quick, Draw! pens, so I randomly thickened and thinned each training image —
without it the model looked good on the test set but failed on real doodles.
Second, the refinement experiment: zoom augmentation plus EMA, +2.4 points,
verified with a McNemar test.

**10. What does "statistically significant" mean here?**
Both models were tested on the same 3,450 drawings, so I compared them
drawing-by-drawing: the new model fixed 169 that the old one missed and broke 87.
The chance of that imbalance happening by luck is about 1 in 2.4 million (p = 4 × 10⁻⁷).

**11. Where does the 0.29 % come from?**
1/345 — the score of a model that guesses blindly among 345 categories.

**12. What can't it do?**
Recognise more than one object at a time; understand scenes; recognise things
outside its 345 categories (nothing outside them can ever be predicted);
recognise very detailed differences like cup vs mug at 28 × 28.

**13. Does it need the internet?**
No. The model is a file served with the website; recognition happens in the
browser. No server, no account, no API key, and drawings never leave the device.

**14. How long does it take to recognise?**
About every 220 ms while you draw, plus a final check after you lift the pen.

**15. How big is the model?**
214,649 parameters, 0.88 MB in the browser format.

**16. What is in the model file?**
The learned weights — millions of numbers? No: 214,649 numbers, stored as binary
alongside a JSON description of the network's layers.

**17. Did you collect any data from users?**
No. There is no backend and no analytics; the drawing never leaves the browser.
That is also why the app follows the dataset's CC BY 4.0 licence by crediting
Google in the attribution files.

**18. How do I know the accuracy isn't fake?**
Every number can be regenerated: the scripts are in `training/` and `scripts/`,
the split and seed are recorded in the model's `manifest.json`, and the test
drawings are fixed. `node scripts/manual-test-345.mjs` runs the real browser code
on 16 hand-drawn doodles in a few seconds.

**19. What would you do with a GPU and a month?**
Train on the full 50-million-drawing dataset (about 500× more data), then try a
96 × 96 input model and compare it honestly on the same 400-drawing test. Data,
not more epochs, is the bottleneck — the model already trains to the limit of
100 drawings per category.

**20. Why doesn't it have a download-PNG button?**
Deliberate: the project keeps every drawing as an editable object instead of
flattening it into one picture. It is a design decision I wrote down, not a
missing feature.

---

## 4. Submission checklist

- [ ] Report (`docs/submission/project-report.md`) filled in, printed, signed.
- [ ] This demo script practised four times; app open and model loaded before you start.
- [ ] Two printouts to hand over: the results table from the report, and the
      one-page evidence list (§7 of the report).
- [ ] Project files submitted as they are in the repository (they are the proof:
      training scripts, evaluation scripts, model files with their `manifest.json`).
- [ ] Log book / project diary, if your school asks for one: one line per working
      session — date, what you tried, what the number became. The git history of
      the project is a ready-made version of this; if allowed, print its log.
- [ ] Ten-second answer ready for "what is this project, in one sentence".

**One sentence, memorise it:**
> "It is a browser drawing app that recognises 345 kinds of doodles with a neural
> network I trained myself, suggests clean illustrations in place of my sketch,
> and gets the right object into the first three suggestions about 60 % of the
> time on drawings it has never seen."
