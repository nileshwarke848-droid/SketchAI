// Candidate sources selected for the replacement suggestion artwork set.
// This is a curation plan, not a license blanket: validate the individual asset
// record before importing or distributing it.
export const SUGGESTION_SOURCE_PLAN = [
  {
    name: 'SVG Repo',
    url: 'https://www.svgrepo.com/svg/85124/cat',
    reason: 'Best visual fit in the preview check; accept only item pages that state a compatible license (for example, CC0).',
  },
  {
    name: 'Openclipart',
    url: 'https://openclipart.org/share',
    reason: 'The site states shared clipart is CC0; still preserve each artwork’s source and verify the downloaded original.',
  },
  {
    name: 'PublicDomainVectors',
    url: 'https://publicdomainvectors.org/',
    reason: 'Use only individual items whose page and upstream provenance support public-domain reuse.',
  },
];
