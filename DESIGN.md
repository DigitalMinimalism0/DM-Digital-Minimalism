# DM visual system

Reading this as a redesign for ordinary token holders, using the user's four supplied images as the visual authority. Native HTML/CSS, self-hosted Manrope and bundled viem retain the small static-site architecture. Design variance 6/10; motion intensity 6/10 at the scroll entrance and 2/10 in the product; visual density 3/10 on brand surfaces, 5/10 inside the participation form.

## Preserve

Near-black #080808, foreground #f5f5f5, muted text #a1a1a1, panel #101010, rules #303030. Images 1 and 3 define the framed entrance: a thin inset border, distributed short text, large negative space, and light lowercase lettering across a small square ocean photograph. Images 2 and 4 define a visible photographic halftone: separate circular dots on black, varying in radius with the source image's luminance. Use the photographic sea, not the soft procedural 3D water. Desktop spacing is 9 CSS pixels; mobile spacing is 7. Final logo artwork is pending; digital minimalism is a lowercase typographic placeholder; DM is the uppercase token name.

## Change

Remove terminal syntax, CLI installation and burn ritual. Replace with a visible deposit/withdraw form, separate ETH collection, inline transaction review and wallet selection. Public participation is readable without connecting. Mainnet deployment and pre-launch states never fabricate balances or rewards.

## Typography and shape

Manrope is restored from the supplied original visual reference and self-hosted with its OFL license. Body 16px/1.65; supporting labels 12–14px. Large identity lettering uses weight 300 and -0.03em tracking; participation headings also use weight 300, with regular body text and medium control labels. A quiet 12px introductory heading follows the first reference. Large identity lettering is a brand graphic, not a functional heading. Square controls and surfaces, no decorative shadows. Text uses sentence case; financial values preserve exact wallet/contract case where useful.

## Motion and accessibility

Native scrolling enlarges the square photograph into a full viewport sea. The photograph changes into the luminance-based dot screen during enlargement; upward scrolling reverses both. Canvas texture is rendered once per image or viewport size, without a continuous render loop. A photograph fallback remains available if 2D canvas is unavailable. At arrival, the deposit/withdraw form appears directly. Rewards and About are peer views in the same environment. The original form nodes are moved, never recreated, preserving drafts, wallet state and transaction reviews. No intermediate three-action menu. Transparent surfaces and fine rules keep the interface in the same sea. A continuous shade protects functional text without an enclosing black panel or nested form card. Hover and state feedback last 150–250ms; reduced motion uses an end-state transition without enlargement. No information depends on animation. Keyboard skip link, native controls/dialog/disclosures, visible focus, semantic tab roles with arrow navigation, 44px+ targets, live statuses and readable contrast.

## Responsive

Below 760px, participation stacks; process steps become a vertical sequence; prose and FAQ become single columns. Tables scroll within their own container. The page itself must not overflow at 390px or 320px. Inputs stay at least 16px on mobile. Brand lettering scales independently of product type.

## Assets

Ocean photograph: https://images.unsplash.com/photo-1518837695005-2083093ee35b, local web/images/ocean.jpg and ocean-world.jpg. Manrope is self-hosted under SIL OFL with its license in web/fonts/manrope-OFL.txt. Supplied reference images guide the composition and effect; third-party reference logos and copy are not reproduced. No remote analytics, scripts or font requests. Repository cover is native vector typography, not a final logo.
