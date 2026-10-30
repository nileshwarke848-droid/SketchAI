import React from 'react';
import { Sparkles } from 'lucide-react';

// The AutoDraw-style suggestion bar: a single horizontally scrolling row of
// clean artwork, sitting directly above the canvas.
//
// Deliberately quiet styling — white cards, hairline borders, one small lift on
// hover. The artwork is the content, so nothing competes with it.

const formatScore = (score) => (score < 0.005 ? '<1%' : `${Math.round(score * 100)}%`);

/**
 * Renders one artwork variant as inline SVG.
 *
 * Inline (rather than an <img> or background-image) so it stays sharp at any
 * size, needs no extra request, and inherits `currentColor` — hand-authored
 * variants pick up the brush colour, Material icons get tinted the same way.
 */
export function VariantArt({ variant, size = 46, className = '' }) {
  const isLineArt = variant.origin === 'lineart' || variant.origin === 'variant';
  const body = isLineArt
    ? variant.b.replaceAll('STROKE', 'currentColor')
    : variant.source === 'mdi'
      ? `<g fill="currentColor">${variant.b}</g>`
      : variant.b;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${variant.w} ${variant.h}`}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

/**
 * @param {object} props
 * @param {Array} props.cards output of buildSuggestions()
 * @param {(card: object) => void} props.onInsert
 * @param {string} [props.title] heading text
 * @param {string} [props.emptyCopy] shown when there is nothing to suggest
 * @param {'idle'|'loading'|'thinking'} [props.phase] drives the subtle busy hint
 */
export default function SuggestionBar({
  cards,
  onInsert,
  title = 'Did you mean…',
  emptyCopy = 'Start drawing to see smart suggestions.',
  phase = 'idle',
}) {
  const hasCards = cards.length > 0;
  return (
    <section className={`suggestion-bar ${hasCards ? 'has-cards' : 'is-empty'}`} aria-label="Drawing suggestions">
      <div className="suggestion-bar-head">
        <span className="suggestion-bar-title">
          <Sparkles size={13} aria-hidden="true" />
          {hasCards ? title : 'Suggestions'}
        </span>
        {hasCards && <span className="suggestion-bar-count">{cards.length} idea{cards.length === 1 ? '' : 's'}</span>}
      </div>

      {hasCards ? (
        <div className="suggestion-scroller" role="group" aria-label={`${cards.length} drawing suggestions`}>
          {cards.map((card) => (
            <button
              type="button"
              key={card.id}
              className={`s-card${card.illustrated ? '' : ' text-only'}`}
              onClick={() => onInsert(card)}
              // Real button semantics: the accessible name says what it does.
              aria-label={`Insert ${card.name} drawing`}
              title={`Insert ${card.name} drawing`}
            >
              <span className="s-card-art">
                {card.illustrated ? (
                  <VariantArt variant={card.variant} size={46} />
                ) : (
                  // No honest illustration exists for this class: a typographic
                  // card, never a broken image or a blank tile.
                  <span className="s-card-initial" aria-hidden="true">
                    {card.name.charAt(0)}
                  </span>
                )}
              </span>
              <span className="s-card-name">{card.name}</span>
              <span className="s-card-score">{formatScore(card.score)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="suggestion-bar-empty" aria-live="polite">
          {emptyCopy}
        </p>
      )}
    </section>
  );
}
