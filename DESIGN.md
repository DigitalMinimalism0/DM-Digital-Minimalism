# DM visual system

Reading this as a redesign for ordinary token holders: quiet, monochrome, spatial branding with familiar product controls. Native HTML/CSS, self-hosted Archivo and bundled viem retain the small static-site architecture. Design variance 6/10; motion intensity 6/10 at the scroll entrance and 2/10 in the product; visual density 3/10 on brand surfaces, 5/10 inside the participation form.

## Preserve

Near-black #080808, foreground #f5f5f5, muted text #a1a1a1, panel #101010, rules #303030. Keep the newer photographic circular halftone from the supplied sea reference: dot radius follows image luminance, with 9px desktop spacing and 7px mobile spacing. This background choice is separate from layout. Preserve the preceding homepage and Participate / Rewards / About sections, not the reference-image frame or composition. Final logo artwork is pending; digital minimalism is a lowercase typographic placeholder; DM is the uppercase token name.

## Change

Remove terminal syntax, CLI installation and burn ritual. Replace with a visible deposit/withdraw form, separate ETH collection, inline transaction review and wallet selection. Public participation is readable without connecting. Mainnet deployment and pre-launch states never fabricate balances or rewards.

## Typography and shape

Archivo 300–600 self-hosted with its OFL license. Body 16px/1.65; functional labels, balance captions, field notes, protocol status and transaction details 14px/1.65. Large identity lettering uses weight 300 and -0.03em tracking; participation headings use weight 400, with regular body text and medium control labels. Administration uses a 36px/500 title, 22px/500 section headings, 15px/1.7 explanatory copy and 14px/500 form labels. Wallet and balance numbers use tabular figures. Large identity lettering is a brand graphic, not a functional heading. Square controls and surfaces, no decorative shadows or gradient treatments. Text uses sentence case; financial values preserve exact wallet/contract case where useful.

## Motion and accessibility

Native scrolling enlarges the ocean photograph and reveals the newer photographic dot screen; upward scrolling reverses both. The texture is drawn once per source or viewport change. If 2D canvas is unavailable, the photograph remains visible. At arrival, the deposit/withdraw form appears directly. Rewards and About are peer views in the same environment. The original form nodes are moved, never recreated, preserving drafts, wallet state and transaction reviews. No intermediate three-action menu. Only the reference-image layout is withdrawn; the newer dot texture is retained. Keep the preceding layout, with a stable opaque #0b0b0b reading surface for all product sections. Sea texture stays outside the text surface. The internal form remains flat, without a nested card. Disabled buttons retain readable captions instead of fading the whole control. Field notes must meet 4.5:1 contrast on the reading surface. Hover and state feedback last 150–250ms; reduced motion skips enlargement. No information depends on animation. Keyboard skip link, native controls/dialog/disclosures, visible focus, semantic tab roles with arrow navigation, 44px+ targets, live statuses and readable contrast.

## Participation leaderboard

The live ETH rewards leaderboard follows the participation form in the same dark reading surface. Rewards navigation reuses that exact table node, preserving the current ranking and expanded rows. Rank by total ETH earned (collected plus claimable), show the connected wallet's place and the last successful update. Check for new blocks every 12 seconds while visible, skip overlapping reads and unchanged blocks, and refresh immediately when the browser tab returns. All accounts in a ranking use one block snapshot. Preserve existing rows during a background read, then replace atomically; on failure clear the ranking and show an automatic retry state. Pre-launch has no invented wallets, values or live indicator.

## Responsive

Below 760px, participation stacks; process steps become a vertical sequence; prose and FAQ become single columns. Tables scroll within their own container. The page itself must not overflow at 390px or 320px. Inputs stay at least 16px on mobile. Brand lettering scales independently of product type.

## Assets

Ocean fallback photograph: https://images.unsplash.com/photo-1518837695005-2083093ee35b, local web/images/ocean.jpg. Archivo: https://github.com/Omnibus-Type/Archivo, self-hosted under SIL OFL with the license in web/fonts/archivo-OFL.txt. No remote analytics, scripts or font requests. Repository cover is native vector typography, not a final logo.
