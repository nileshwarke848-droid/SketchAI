# Artwork review index — all 345 canonical categories

This index covers every Quick, Draw! canonical label in the model's official order. Batch 1 remains in its original review scope; Batch 2 is **101–200** and Batch 3 is **201–345**. The numbered sheets show the actual artwork pools, approved counted options, excluded near-duplicates/clipped drawings, and preserved app fallbacks.

## Contact sheets

Each PNG page contains ten categories (the final Batch-3 page contains five). Batch-1 overview and page artifacts are preserved unchanged.

### Batch 1 — canonical 1–100 (preserved)

- [100-category overview](batch-1-contact-sheet.png)

| Sheet | Canonical range |
|---|---:|
| [batch-1-contact-sheet-01.png](batch-1-contact-sheet-01.png) | 1–10 |
| [batch-1-contact-sheet-02.png](batch-1-contact-sheet-02.png) | 11–20 |
| [batch-1-contact-sheet-03.png](batch-1-contact-sheet-03.png) | 21–30 |
| [batch-1-contact-sheet-04.png](batch-1-contact-sheet-04.png) | 31–40 |
| [batch-1-contact-sheet-05.png](batch-1-contact-sheet-05.png) | 41–50 |
| [batch-1-contact-sheet-06.png](batch-1-contact-sheet-06.png) | 51–60 |
| [batch-1-contact-sheet-07.png](batch-1-contact-sheet-07.png) | 61–70 |
| [batch-1-contact-sheet-08.png](batch-1-contact-sheet-08.png) | 71–80 |
| [batch-1-contact-sheet-09.png](batch-1-contact-sheet-09.png) | 81–90 |
| [batch-1-contact-sheet-10.png](batch-1-contact-sheet-10.png) | 91–100 |

### Batch 2 — canonical 101–200

| Sheet | Canonical range |
|---|---:|
| [batch-2-contact-sheet-01.png](batch-2-contact-sheet-01.png) | 101–110 |
| [batch-2-contact-sheet-02.png](batch-2-contact-sheet-02.png) | 111–120 |
| [batch-2-contact-sheet-03.png](batch-2-contact-sheet-03.png) | 121–130 |
| [batch-2-contact-sheet-04.png](batch-2-contact-sheet-04.png) | 131–140 |
| [batch-2-contact-sheet-05.png](batch-2-contact-sheet-05.png) | 141–150 |
| [batch-2-contact-sheet-06.png](batch-2-contact-sheet-06.png) | 151–160 |
| [batch-2-contact-sheet-07.png](batch-2-contact-sheet-07.png) | 161–170 |
| [batch-2-contact-sheet-08.png](batch-2-contact-sheet-08.png) | 171–180 |
| [batch-2-contact-sheet-09.png](batch-2-contact-sheet-09.png) | 181–190 |
| [batch-2-contact-sheet-10.png](batch-2-contact-sheet-10.png) | 191–200 |

### Batch 3 — canonical 201–345

| Sheet | Canonical range |
|---|---:|
| [batch-3-contact-sheet-01.png](batch-3-contact-sheet-01.png) | 201–210 |
| [batch-3-contact-sheet-02.png](batch-3-contact-sheet-02.png) | 211–220 |
| [batch-3-contact-sheet-03.png](batch-3-contact-sheet-03.png) | 221–230 |
| [batch-3-contact-sheet-04.png](batch-3-contact-sheet-04.png) | 231–240 |
| [batch-3-contact-sheet-05.png](batch-3-contact-sheet-05.png) | 241–250 |
| [batch-3-contact-sheet-06.png](batch-3-contact-sheet-06.png) | 251–260 |
| [batch-3-contact-sheet-07.png](batch-3-contact-sheet-07.png) | 261–270 |
| [batch-3-contact-sheet-08.png](batch-3-contact-sheet-08.png) | 271–280 |
| [batch-3-contact-sheet-09.png](batch-3-contact-sheet-09.png) | 281–290 |
| [batch-3-contact-sheet-10.png](batch-3-contact-sheet-10.png) | 291–300 |
| [batch-3-contact-sheet-11.png](batch-3-contact-sheet-11.png) | 301–310 |
| [batch-3-contact-sheet-12.png](batch-3-contact-sheet-12.png) | 311–320 |
| [batch-3-contact-sheet-13.png](batch-3-contact-sheet-13.png) | 321–330 |
| [batch-3-contact-sheet-14.png](batch-3-contact-sheet-14.png) | 331–340 |
| [batch-3-contact-sheet-15.png](batch-3-contact-sheet-15.png) | 341–345 |

Machine-readable, per-category records (including artwork IDs, origins, source names, exclusions, overlap values, and fallback state): [all-category-option-audit.json](all-category-option-audit.json). Phase-specific sheet manifests: [Batch 2](batch-2-review-manifest.json) · [Batch 3](batch-3-review-manifest.json).

## Counting rules and QA snapshot

A counted option must render as a nonblank, legible drawing of the canonical object, fit inside its frame, and be distinct from already-counted art. Raster near-duplicates use the shared **0.62** visual-overlap threshold; human curation additionally excludes semantic lookalikes, wrong subtypes, decorative/UI marks, and clipped line art. The frozen Batch-1 rules remain in `scripts/batch1-artwork-review.mjs`; Batch-2/3 rules and documented exclusions are in `scripts/batch-artwork-review.mjs`. The full audit records 118 manual exclusions and 3 additional raster near-duplicates (overlap above 0.62) as not counted. Existing legacy icons remain available where the app already falls back to them, but they do **not** inflate clean-option counts.

| Scope | Clean primary coverage | Distinct options | Distribution (3+ / 2 / 1 / 0) | Licensed source variants | Variant labels | Custom/derived drawings | Manual exclusion rules | Categories under 3 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Batch 1 · 1–100 | 99/100 | 154 | 12 / 29 / 58 / 1 | 25 | 24 | 13 | 34 | 88 |
| Batch 2 · 101–200 | 89/100 | 114 | 5 / 14 / 70 / 11 | 11 | 10 | 1 | 37 | 95 |
| Batch 3 · 201–345 | 127/145 | 162 | 7 / 21 / 99 / 18 | 14 | 13 | 1 | 47 | 138 |
| **All · 1–345** | **315/345** | **430** | **24 / 64 / 227 / 30** | **50** | **47** | **15** | **118** | **321** |

So the complete pool has **430** distinct counted options across 345 categories; **321** have fewer than three, and no category was padded just to reach three. The 30 zero-option labels remain honest fallback/text states.

### Every category with fewer than three counted options

Indices are one-based canonical positions. Counts below reflect reviewed, distinct options (not legacy app fallback icons).

<details>
<summary>0 options — 30 categories</summary>

057 camouflage; 103 elbow; 113 finger; 124 foot; 127 frying pan; 128 garden; 129 garden hose; 131 goatee; 132 golf club; 159 jail; 163 knee; 177 lobster; 203 onion; 207 paint can; 209 panda; 213 parrot; 229 pond; 232 postcard; 237 raccoon; 243 rhinoceros; 281 squiggle; 286 stereo; 288 stitches; 293 string bean; 298 sweater; 299 swing set; 310 the great wall of china; 314 toe; 336 waterslide; 345 zigzag

</details>

<details>
<summary>1 options — 227 categories</summary>

001 aircraft carrier; 003 alarm clock; 005 angel; 006 animal migration; 007 ant; 009 apple; 011 asparagus; 012 axe; 013 backpack; 014 banana; 016 barn; 017 baseball; 018 baseball bat; 020 basketball; 021 bat; 022 bathtub; 024 bear; 025 beard; 028 belt; 029 bench; 030 bicycle; 033 birthday cake; 034 blackberry; 035 blueberry; 037 boomerang; 038 bottlecap; 039 bowtie; 040 bracelet; 041 brain; 045 broom; 046 bucket; 047 bulldozer; 049 bush; 052 cake; 053 calculator; 054 calendar; 056 camera; 058 campfire; 060 cannon; 063 carrot; 067 cello; 068 cell phone; 070 chandelier; 071 church; 072 circle; 073 clarinet; 077 compass; 079 cookie; 080 cooler; 082 cow; 084 crayon; 085 crocodile; 086 crown; 087 cruise ship; 090 dishwasher; 091 diving board; 097 dresser; 098 drill; 101 dumbbell; 105 envelope; 106 eraser; 107 eye; 108 eyeglasses; 109 face; 110 fan; 111 feather; 112 fence; 114 fire hydrant; 115 fireplace; 116 firetruck; 117 fish; 118 flamingo; 120 flip flops; 121 floor lamp; 123 flying saucer; 125 fork; 130 giraffe; 133 grapes; 134 grass; 136 hamburger; 139 harp; 141 headphones; 142 hedgehog; 143 helicopter; 146 hockey puck; 147 hockey stick; 148 horse; 150 hot air balloon; 151 hot dog; 152 hot tub; 154 house; 155 house plant; 156 hurricane; 158 jacket; 160 kangaroo; 161 key; 162 keyboard; 164 knife; 165 ladder; 166 lantern; 167 laptop; 168 leaf; 169 leg; 170 light bulb; 171 lighter; 173 lightning; 174 line; 176 lipstick; 179 mailbox; 180 map; 181 marker; 182 matches; 183 megaphone; 184 mermaid; 186 microwave; 187 monkey; 188 moon; 189 mosquito; 190 motorbike; 191 mountain; 192 mouse; 193 moustache; 194 mouth; 195 mug; 196 mushroom; 197 nail; 198 necklace; 200 ocean; 201 octagon; 204 oven; 205 owl; 208 palm tree; 210 pants; 211 paper clip; 212 parachute; 214 passport; 216 pear; 217 peas; 218 pencil; 221 pickup truck; 222 picture frame; 223 pig; 224 pillow; 227 pliers; 228 police car; 230 pool; 231 popsicle; 233 potato; 234 power outlet; 235 purse; 239 rain; 240 rainbow; 241 rake; 242 remote control; 244 rifle; 245 river; 246 roller coaster; 247 rollerskates; 248 sailboat; 249 sandwich; 250 saw; 252 school bus; 253 scissors; 254 scorpion; 255 screwdriver; 257 see saw; 258 shark; 259 sheep; 260 shoe; 261 shorts; 262 shovel; 263 sink; 264 skateboard; 265 skull; 267 sleeping bag; 269 snail; 271 snorkel; 272 snowflake; 274 soccer ball; 275 sock; 276 speedboat; 277 spider; 278 spoon; 279 spreadsheet; 283 stairs; 284 star; 285 steak; 287 stethoscope; 289 stop sign; 290 stove; 292 streetlight; 294 submarine; 295 suitcase; 297 swan; 300 sword; 301 syringe; 303 teapot; 304 teddy-bear; 305 telephone; 306 television; 307 tennis racquet; 308 tent; 309 the eiffel tower; 311 the mona lisa; 313 toaster; 316 tooth; 317 toothbrush; 318 toothpaste; 320 tractor; 321 traffic light; 322 train; 324 triangle; 325 trombone; 326 truck; 327 trumpet; 328 t-shirt; 329 umbrella; 330 underwear; 331 van; 332 vase; 334 washing machine; 338 wheel; 339 windmill; 340 wine bottle; 341 wine glass; 342 wristwatch; 344 zebra

</details>

<details>
<summary>2 options — 64 categories</summary>

002 airplane; 004 ambulance; 008 anvil; 010 arm; 015 bandage; 019 basket; 023 beach; 026 bed; 027 bee; 031 binoculars; 036 book; 042 bread; 043 bridge; 044 broccoli; 050 butterfly; 055 camel; 059 candle; 061 canoe; 062 car; 066 ceiling fan; 069 chair; 074 clock; 076 coffee cup; 083 crab; 088 cup; 089 diamond; 093 dolphin; 094 donut; 096 dragon; 104 elephant; 119 flashlight; 126 frog; 135 guitar; 140 hat; 144 helmet; 145 hexagon; 153 hourglass; 157 ice cream; 172 lighthouse; 175 lion; 178 lollipop; 185 microphone; 199 nose; 202 octopus; 206 paintbrush; 215 peanut; 219 penguin; 225 pineapple; 226 pizza; 236 rabbit; 238 radio; 256 sea turtle; 266 skyscraper; 268 smiley face; 270 snake; 273 snowman; 280 square; 291 strawberry; 296 sun; 312 tiger; 315 toilet; 323 tree; 335 watermelon; 337 whale

</details>

## Custom/derived art and curation notes

The 15 original local drawings are: angel (Batch 1), animal migration (Batch 1), bottlecap (Batch 1), bracelet (Batch 1), blackberry (Batch 1), blueberry (Batch 1), cello (Batch 1), clarinet (Batch 1), crayon (Batch 1), cooler (Batch 1), diving board (Batch 1), dresser (Batch 1), cruise ship (Batch 1), fireplace (Batch 2), stop sign (Batch 3). They are authored as local SVGs and do not copy the paths of upstream icons. The Batch-2 fireplace drawing replaces two too-dense exact glyphs. The Batch-3 stop sign drawing replaces the only pinned exact glyph after its raster ink measured 52.8%; it uses a simple octagon, pole, and path-drawn STOP lettering.

Important uncertainties and deliberate non-matches:

- **Garden hose**: no suitable pinned exact source; text-only. **Swing set**: no accurate set source; a tree swing is not treated as a swing set.
- **The Great Wall of China**: no clean exact illustration; brick-wall imagery is not counted. **Stereo**: a speaker/loudspeaker is only a weak legacy fallback and is not counted as a stereo.
- **Raccoon**: the available head-only fallback does not meet the whole-animal requirement and is not counted. Similar whole-body requirements are preserved for animal sources.
- **Golf club** and **paint can**: misleading flag-in-hole and palette/bucket art were removed from the fallback/primary pools; both are text-only pending a suitable exact source.
- **Foot**, **mouse**, and **sheep**: clipped hand-drawn line art touches the frame and is not counted; the remaining clean source is retained where available.
- Legacy **APP FALLBACK · NOT COUNTED** tiles show app-visible fallback artwork only. **FALLBACK · TEXT ONLY** means there is no clean drawing or retained icon for that class.

Curation corrections include police car → `gameicons/police-car`, power outlet → `tabler/outlet`, oven → `mdi/toaster-oven`, table → `mdi/table-furniture`, Mona Lisa → `gameicons/mona-lisa`, passport → `gameicons/passport`, stove → `gameicons/gas-stove`, shorts → `gameicons/underwear-shorts`, wine bottle → `mdi/bottle-wine`, and wine glass → `mdi/glass-wine`. The requested exact Game Icons sources for streetlight, underwear, swan, trombone, steak, scorpion, tennis racquet, and windmill are also pinned in the source registry; no alternative was forced when a suitable distinct drawing was not available.

## Sources, licenses, and reproducibility

Primary imports: **296/345** categories. Each source is pinned in `scripts/oss-art-sources.mjs`; batch-specific variants have curated maps and generated credit files. All source fetches use official npm packages or the official tagged Iconoir GitHub archive—no Google AutoDraw scraping, random web art, or new emoji primaries.

| Pinned library | License | Imported primaries |
|---|---|---:|
| Tabler Icons 3.50.0 | MIT | 124 |
| Lucide 1.65.0 | ISC | 41 |
| Iconoir 7.12.1 | MIT | 13 |
| Material Design Icons 7.4.47 | Apache-2.0 | 64 |
| Game Icons 1.2.4 | CC BY 3.0 | 43 |
| Font Awesome Free 7.3.1 | CC BY 4.0 | 11 |

Full category-level attribution is in `scripts/oss-art-credits.json`, `scripts/oss-art-variant-credits.json`, `scripts/oss-art-variant-credits-batch2.json`, and `scripts/oss-art-variant-credits-batch3.json`. The complete pinned versions/URLs and credits are included in the audit JSON.

Rebuild from an empty temporary cache and require byte-identical generated primaries, credits, and both batch variant sets with:

```sh
node scripts/test-oss-art-reproducibility.mjs
node scripts/audit-all-artwork-options.mjs
node scripts/render-batch-review-sheets.mjs
node scripts/render-artwork-review-index.mjs
```

The cold-cache audit compares generated primaries and both variant sets byte-for-byte. After commit, `node scripts/audit-artwork-scope.mjs --base=HEAD^` verifies canonical range scope and byte-identical Batch-1 inputs/artifacts. Build and app regression checks are tracked in the final handoff; real-browser download confirmation still requires the short manual checklist because jsdom does not implement browser download policy.
