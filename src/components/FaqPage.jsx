import { useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Code2,
  FlaskConical,
  Gauge,
  GraduationCap,
  Layers,
  MousePointer2,
  Palette,
  Sparkles,
  Wand2,
} from 'lucide-react';
import '../faq.css';

const SECTIONS = [
  { id: 'how', label: 'How it works' },
  { id: 'tech', label: 'The tech' },
  { id: 'built', label: 'How it was built' },
  { id: 'questions', label: 'FAQ' },
];

const STEPS = [
  {
    icon: MousePointer2,
    title: 'You draw',
    body: 'Pencil, shapes, text or a bucket fill on a canvas that lives in the page. While you sketch, nothing leaves your computer.',
  },
  {
    icon: Layers,
    title: 'The app tidies it up',
    body: 'Your ink is cropped, centred and shrunk to a 28 × 28 grid of grey pixels — exactly the format the model was trained on.',
  },
  {
    icon: BrainCircuit,
    title: 'A small network guesses',
    body: 'A neural network I trained scores all 345 categories in roughly 20 ms, on your device, using TensorFlow.js.',
  },
  {
    icon: Wand2,
    title: 'You pick the keeper',
    body: 'Choose an illustration and it lands as a real object: move it, resize it, rotate it, recolour it, flip it, or undo it.',
  },
];

const TECH = [
  {
    icon: Code2,
    name: 'React 18 + Vite 6',
    body: 'Every panel, tool and slider is a React component, and Vite bundles the lot into plain static files. There is no backend to run and nothing to sign into.',
  },
  {
    icon: Palette,
    name: 'HTML Canvas 2D',
    body: 'Strokes, shapes, the erase mask and the bucket fill all work on real pixels. That is what lets the doodle eraser split one drawing into two separate pieces.',
  },
  {
    icon: BrainCircuit,
    name: 'TensorFlow.js 4.22',
    body: 'Downloads the 0.88 MB model once, then runs every prediction inside the browser tab — WebGL when it is available, plain CPU when it is not.',
  },
  {
    icon: Sparkles,
    name: 'A CNN I trained here',
    body: '345 classes, 214,649 parameters, trained from scratch in this repository on a laptop CPU. No pretrained weights were borrowed.',
  },
  {
    icon: BookOpen,
    name: 'Openly licensed illustration sets',
    body: 'Lucide, Game-icons, MDI, Tabler, Font Awesome and Iconoir supply the clean artwork. Every set is credited inside the app.',
  },
  {
    icon: FlaskConical,
    name: 'Node.js + jsdom for testing',
    body: 'The same app code runs outside the browser so 277 automated checks can prove the tools, the model and the selection logic still behave.',
  },
];

const TIMELINE = [
  {
    label: '1 · Data',
    title: '34,500 drawings, 345 categories',
    body: '100 drawings for each of the official Quick, Draw! categories, openly licensed (CC BY 4.0).',
  },
  {
    label: '2 · Train',
    title: 'Three rounds on a laptop CPU',
    body: '60, then 24, then 26 epochs with augmentation for thickness, scale and rotation — about 30 minutes in total, no GPU.',
  },
  {
    label: '3 · Export',
    title: 'Keras → TensorFlow.js',
    body: 'The trained network is converted to a browser asset and checked against the original: they agree to 2.7 × 10⁻⁷.',
  },
  {
    label: '4 · Measure',
    title: '3,450 drawings it had never seen',
    body: 'The first guess is right 40 % of the time, the answer is in the top three 59 %, and in the top ten 78 %.',
  },
  {
    label: '5 · Improve',
    title: 'One change, measured properly',
    body: 'Teaching the model about scale moved top-1 from 37.7 % to 40.1 % — a paired test put the chance of luck at 4 × 10⁻⁷.',
  },
  {
    label: '6 · Test and ship',
    title: '16 suites, 277 checks, no server',
    body: 'Every tool is covered by automated checks, the build is a static folder, and the app works offline once loaded.',
  },
];

const QUESTIONS = [
  {
    q: 'What is SketchAI, in one sentence?',
    a: 'A drawing app that runs in your browser: you sketch with a mouse or a pen, and a neural network suggests a clean illustration you can drop in and keep editing.',
    open: true,
  },
  {
    q: 'Do I have to be good at drawing?',
    a: 'No. The model was trained on quick doodles, not masterpieces. Draw reasonably large and keep the strokes connected — a tiny wobbly sketch in one corner is the hardest possible input.',
  },
  {
    q: 'How accurate is it, really?',
    a: 'On 3,450 drawings it had never seen, the first suggestion is correct 40 % of the time, the right answer is in the top three 59 % of the time and in the top ten 78 %. Those are the numbers I say out loud, in the viva as well as here.',
  },
  {
    q: 'Why is it not as good as Google AutoDraw?',
    a: 'AutoDraw was built by a team at Google with the full 50-million-drawing dataset. Mine learned from 34,500 drawings, trained by one student on a laptop CPU in about half an hour. It is the same idea at a much smaller scale — and on the same 400 drawings it beat a pretrained third-party doodle model nearly two to one.',
  },
  {
    q: 'Does my drawing get uploaded anywhere?',
    a: 'No. The model is part of the site, so recognising a doodle happens inside your tab. There is no server, no account, no API key, and no image ever leaves the page.',
  },
  {
    q: 'Does it work without internet?',
    a: 'Yes, once the page has loaded. The model, the fonts and the illustrations are all bundled with the app rather than fetched from somewhere else.',
  },
  {
    q: 'What can it not do?',
    a: 'It only knows 345 categories. It is weakest on abstract or compound shapes, thin pale lines, and words drawn as ink (use the Text tool for those). It looks at one doodle at a time, so a whole scene is a bad fit.',
  },
  {
    q: 'Why did it call my tree a cloud?',
    a: 'Clouds, bushes and tree crowns look alike at 28 × 28 pixels. When two categories score closely, look at the top ten instead of the top one — the right answer is usually in there.',
  },
  {
    q: 'What happens to my sketch when I accept a suggestion?',
    a: 'The artwork replaces the rough stroke as a separate editable object, and Undo (24 steps) brings the sketch straight back. The pencil layer and the clean objects never mix.',
  },
  {
    q: 'Can I save what I make?',
    a: 'There is no image export yet — the canvas is a live document, so take a screenshot if you need a copy. Closing the tab starts you with a fresh canvas.',
  },
  {
    q: 'How do you know the app still works?',
    a: 'One command, npm test, runs 16 test suites and 277 end-to-end checks against the real app code: drawing, selecting, erasing, filling, shapes, zooming, undo. All of them pass.',
  },
  {
    q: 'Who built this, and why?',
    a: 'A Class 10 CBSE student, for the Artificial Intelligence (417) project — the model, the training scripts, the app and these notes. The AI assistant that helped with code and documentation is declared honestly in the report.',
  },
];

export default function FaqPage({ onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="faq-screen" role="dialog" aria-modal="true" aria-labelledby="faq-title">
      <div className="faq-wash" aria-hidden="true" />

      <header className="faq-nav">
        <div className="faq-nav-inner">
          <div className="faq-brand">
            <span className="faq-brand-mark"><Sparkles size={17} /></span>
            <span>Sketch<span className="faq-brand-ai">AI</span></span>
          </div>
          <nav className="faq-nav-links" aria-label="Page sections">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >{section.label}</a>
            ))}
          </nav>
          <div className="faq-nav-actions">
            <span className="faq-chip"><GraduationCap size={14} /> CBSE Class 10</span>
            <button type="button" className="faq-back" onClick={onClose} aria-label="Close FAQ">
              <ArrowLeft size={16} /> <span>Back to canvas</span>
            </button>
          </div>
        </div>
      </header>

      <main className="faq-main">
        <section className="faq-hero">
          <span className="faq-eyebrow"><Gauge size={13} /> The short version</span>
          <h1 id="faq-title" className="faq-h1">
            How SketchAI <span className="faq-mark">actually works</span>.
          </h1>
          <p className="faq-lede">
            A plain-language tour of the app: what happens when you put pen to canvas, what it is built with,
            how it was trained and tested, and honest answers to the questions people ask most.
          </p>
          <div className="faq-actions">
            <button type="button" className="faq-cta" onClick={onClose}>
              Start drawing <ArrowRight size={17} />
            </button>
            <a
              className="faq-cta ghost"
              href="#how"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById('how')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >Read the tour</a>
          </div>

          <div className="faq-stats">
            <div className="faq-stat"><strong>345</strong><span>doodle categories</span></div>
            <div className="faq-stat"><strong>40 %</strong><span>first guess right</span></div>
            <div className="faq-stat"><strong>59 %</strong><span>right answer in top three</span></div>
            <div className="faq-stat"><strong>277</strong><span>automated checks</span></div>
          </div>
        </section>

        <section className="faq-section" id="how">
          <span className="faq-kicker">01 — The tour</span>
          <h2 className="faq-h2">Four things happen after you lift the pen.</h2>
          <p className="faq-sub">No uploads, no waiting on a server. The whole loop runs inside this tab in well under a second.</p>
          <div className="faq-grid faq-grid-4">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <article className="faq-card faq-step" key={step.title}>
                  <div className="faq-step-head">
                    <span className="faq-step-num">{index + 1}</span>
                    <Icon size={19} className="faq-step-icon" />
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="faq-section" id="tech">
          <span className="faq-kicker">02 — The bits it is made of</span>
          <h2 className="faq-h2">Six technologies, each doing one job.</h2>
          <p className="faq-sub">Every choice here beat an alternative: a more common tool that would have been slower, heavier or simply out of reach for this project.</p>
          <div className="faq-grid faq-grid-3">
            {TECH.map((item) => {
              const Icon = item.icon;
              return (
                <article className="faq-card" key={item.name}>
                  <span className="faq-icon"><Icon size={18} /></span>
                  <h3>{item.name}</h3>
                  <p>{item.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="faq-section" id="built">
          <span className="faq-kicker">03 — How it was built</span>
          <h2 className="faq-h2">From a pile of drawings to a working app.</h2>
          <p className="faq-sub">Six steps, in the order they happened. Everything except the original dataset was made in this repository.</p>
          <div className="faq-timeline">
            {TIMELINE.map((moment) => (
              <article className="faq-moment" key={moment.label}>
                <span className="faq-when">{moment.label}</span>
                <h3>{moment.title}</h3>
                <p>{moment.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="faq-section" id="questions">
          <span className="faq-kicker">04 — Questions</span>
          <h2 className="faq-h2">The ones people actually ask.</h2>
          <p className="faq-sub">Tap a question to open it. No marketing answers — if something is limited, it says so.</p>
          <div className="faq-list">
            {QUESTIONS.map((item) => (
              <details className="faq-item" key={item.q} open={item.open}>
                <summary>{item.q}</summary>
                <p className="faq-answer">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <footer className="faq-footer">
          <div>
            <p className="faq-footer-title">Every number on this page is measured.</p>
            <p>The accuracy figures come from 3,450 held-out drawings; the checks come from <code>npm test</code> in the project.</p>
          </div>
          <div className="faq-credits">
            <p>Drawings: Google Quick, Draw! (CC BY 4.0). Artwork: Lucide, Game-icons, MDI, Tabler, Font Awesome, Iconoir.</p>
            <button type="button" className="faq-back" onClick={onClose} aria-label="Back to the canvas">
              <ArrowLeft size={16} /> <span>Back to the canvas</span>
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
