// Component-level Nocturne visual rules, re-authored as css() mixin
// descriptors referencing var(--color-*) tokens from tokens.css — ADR 0002's
// committed split between the global token sheet and this scoped style
// layer.

import { css } from 'remix/ui'

export const focusRingCss = css({
  '&:focus-visible': {
    outline: '2px solid var(--color-accent)',
    outlineOffset: '2px',
  },
})

export const rootCss = css({
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontFamily: 'var(--font-body)',
  padding: '22px clamp(12px, 4vw, 48px) 64px',
  minHeight: '100vh',
})

export const headerCss = css({ marginBottom: '4px' })
export const titleRowCss = css({ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' })
export const h4Css = css({ margin: 0, letterSpacing: '-0.02em' })
export const captionCss = css({
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-neutral-500)',
})
export const ledeCss = css({
  margin: '0 0 18px',
  fontSize: '13px',
  color: 'var(--color-neutral-500)',
  maxWidth: '62ch',
})

export const toolbarCss = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '14px',
})
// Handoff: "flex 1 1 240px, max-width 340px" — `minWidth: 0` lets the flex
// item actually shrink below its content size instead of overflowing the
// toolbar and overlapping the segmented control at narrower widths.
export const filterWrapCss = css({
  position: 'relative',
  flex: '1 1 240px',
  minWidth: 0,
  maxWidth: '340px',
})
export const inputCss = css({
  boxSizing: 'border-box',
  width: '100%',
  minHeight: '36px',
  padding: '6px 30px 6px 10px',
  font: 'inherit',
  fontSize: '14px',
  color: 'var(--color-text)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-divider)',
  borderRadius: 'var(--radius-md)',
})
export const matchCounterCss = css({
  position: 'absolute',
  right: '9px',
  top: '50%',
  transform: 'translateY(-50%)',
  fontSize: '11px',
  color: 'var(--color-neutral-600)',
})
export const segCss = css({
  display: 'inline-flex',
  overflow: 'hidden',
  border: '1px solid var(--color-divider)',
  borderRadius: 'var(--radius-md)',
})
export const segButtonCss = css({
  appearance: 'none',
  cursor: 'pointer',
  background: 'transparent',
  border: 0,
  padding: '7px 12px',
  fontSize: '13px',
  color: 'var(--color-text)',
  '&[aria-pressed="true"]': { color: 'var(--color-accent)', boxShadow: 'inset 0 0 0 1px var(--color-accent)' },
})
export const btnCss = css({
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  cursor: 'pointer',
  background: 'transparent',
  border: '1px solid var(--color-divider)',
  borderRadius: 'var(--radius-md)',
  padding: '6px 12px',
  fontSize: '14px',
  color: 'var(--color-text)',
  '&:disabled': { opacity: 0.45, cursor: 'not-allowed' },
})
export const autoLabelCss = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  fontSize: '13px',
  color: 'var(--color-neutral-400)',
})
export const statusCss = css({ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' })
// Handoff: "a 7px dot with a matching 0 0 8px glow" — shape lives here;
// the per-tier color and its matching box-shadow glow are set inline
// (style prop) per render since they're dynamic values.
export const statusDotCss = css({
  display: 'inline-block',
  width: '7px',
  height: '7px',
  borderRadius: '50%',
  flex: 'none',
})

export const budgetStripCss = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '10px 18px',
  padding: '8px 12px',
  marginBottom: '14px',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-surface)',
  boxShadow: 'var(--shadow-sm)',
})
export const budgetCaptionCss = css({
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-neutral-600)',
})
export const pipsCss = css({ display: 'flex', alignItems: 'center', gap: '4px' })
export const pipCss = css({
  width: '12px',
  height: '5px',
  borderRadius: '2px',
  background: 'var(--color-neutral-800)',
  '&[data-filled="true"]': { background: 'var(--color-accent-500)' },
})
export const budgetLabelCss = css({
  fontSize: '12px',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--color-neutral-400)',
})
export const roleLabelCss = css({ fontSize: '12px', color: 'var(--color-neutral-500)' })

export const bannerCss = css({
  padding: '10px 12px',
  marginBottom: '12px',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-accent-900)',
  color: 'var(--color-accent-300)',
  fontSize: '12px',
  lineHeight: 1.5,
})
export const noticeCss = css({ margin: '0 0 10px', fontSize: '12px', color: 'var(--color-neutral-500)' })
export const emptyStateCss = css({ margin: '26px 4px', fontSize: '13px', color: 'var(--color-neutral-600)' })
export const footnoteCss = css({
  margin: '22px 4px 0',
  fontSize: '11px',
  lineHeight: 1.7,
  color: 'var(--color-neutral-700)',
  maxWidth: '78ch',
})
export const visuallyHiddenCss = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
})

export const gridCss = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))',
  gap: '11px',
  alignItems: 'start',
})

// Table view (designs/README.md "Table" + "Row anatomy"): a CSS grid, not a
// <table>, so rows stay valid drag targets. Header and rows share one
// column template so their cells line up.
const TABLE_COLUMNS =
  '26px minmax(150px, 1.5fr) minmax(96px, 1fr) minmax(96px, 1fr) 92px 74px 30px'

export const tableWrapCss = css({ overflowX: 'auto' })
export const tableInnerCss = css({
  minWidth: '660px',
  display: 'flex',
  flexDirection: 'column',
})
export const tableHeaderCss = css({
  boxSizing: 'border-box',
  display: 'grid',
  gridTemplateColumns: TABLE_COLUMNS,
  gap: '10px',
  alignItems: 'center',
  padding: '0 4px 7px',
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-neutral-600)',
  // The fading 1px rule, painted as the header row's own bottom background
  // (a Nocturne signature — see .table in designs/nocturne/styles.css).
  background:
    'linear-gradient(to right, transparent, var(--color-divider) 48px, var(--color-divider) calc(100% - 48px), transparent) no-repeat bottom / 100% 1px',
})
export const tableRowCss = css({
  boxSizing: 'border-box',
  display: 'grid',
  gridTemplateColumns: TABLE_COLUMNS,
  gap: '10px',
  alignItems: 'center',
  padding: '9px 4px',
  borderRadius: 'var(--radius-sm)',
  transition: 'background 120ms ease, opacity 120ms ease, box-shadow 120ms ease',
  '&:hover': { background: 'color-mix(in srgb, var(--color-text) 5%, transparent)' },
  '&[data-hidden="true"]': { display: 'none' },
})
export const tableAssetCellCss = css({
  display: 'flex',
  alignItems: 'center',
  gap: '9px',
  minWidth: 0,
})
export const tableTrendCellCss = css({ display: 'flex', alignItems: 'center' })

export const cardCss = css({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  padding: '12px 13px 11px',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-surface)',
  boxShadow: 'var(--shadow-sm)',
  transition: 'background 120ms ease, opacity 120ms ease, box-shadow 120ms ease',
  '&[data-hidden="true"]': { display: 'none' },
})
export const cardHeaderCss = css({ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '12px' })
export const badgeCss = css({
  width: '30px',
  height: '30px',
  flex: 'none',
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--color-accent-300)',
  background: 'var(--color-accent-900)',
  boxShadow: 'inset 0 0 0 1px var(--color-accent-800)',
})
export const titlesCss = css({ minWidth: 0, flex: 1 })
export const nameCss = css({
  display: 'block',
  fontSize: '14px',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})
export const symbolCss = css({
  display: 'block',
  fontSize: '11px',
  color: 'var(--color-neutral-600)',
  letterSpacing: '0.06em',
})
export function pinButtonCss(pinned: boolean) {
  return css({
    width: '26px',
    height: '26px',
    flex: 'none',
    padding: 0,
    marginLeft: 'auto',
    background: 'transparent',
    border: 0,
    cursor: 'pointer',
    fontSize: '13px',
    color: pinned ? 'var(--color-accent)' : 'var(--color-neutral-700)',
  })
}
export function dragHandleCss(draggable: boolean) {
  return css({
    flex: 'none',
    fontSize: '13px',
    letterSpacing: '2px',
    color: 'var(--color-neutral-700)',
    userSelect: 'none',
    cursor: draggable ? 'grab' : 'default',
  })
}
export const priceRowCss = css({
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: '10px',
})
export const usdCaptionCss = css({
  display: 'block',
  fontSize: '10px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--color-neutral-600)',
  marginBottom: '2px',
})
export const usdValueCss = css({
  display: 'block',
  fontWeight: 500,
  fontSize: '22px',
  letterSpacing: '-0.02em',
  fontVariantNumeric: 'tabular-nums',
})
export const footerRowCss = css({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '10px',
  marginTop: '10px',
  paddingTop: '9px',
  background:
    'linear-gradient(to right, transparent, var(--color-divider) 24px, var(--color-divider) calc(100% - 24px), transparent) no-repeat top / 100% 1px',
})
export const btcValueCss = css({
  fontSize: '13px',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--color-neutral-500)',
})
