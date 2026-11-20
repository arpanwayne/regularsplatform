# Loopdesk AI design system

All 7 Loopdesk AI tools share one look: hub, Calls, Jobs, Google Profile, Ads, Loyvexa and Korvo. The full rules, tokens and component previews are in the **Loopdesk AI** design system: https://claude.ai/artifact/S35zphB6KkUF7PJigt6xVZ

The rules in short:

- **Two portals, one design** (PR #18, `lib/portal.ts`). Loopdesk AI and Regulars are both Loopdesk AI products, so they share the logo, crimson, font and components. Only the name in the bar differs ("Loopdesk AI" or "Regulars").
- **Colours** are the crimson from the logo. The top bar is `brand-700` (#a3122a) with white text, and primary buttons are `brand-600` (#b8142f) with hover `brand-800`. Everything else is white and gray.
- **Status colours** are green for done or active, amber for pending, red for failed or missed, and blue for in progress. Green is never the brand.
- **Font** is IBM Plex Sans, with Noto Sans Devanagari for Hindi, loaded in `app/layout.tsx`.
- **Shapes:** every button, nav item and badge is a pill (`rounded-full`). Inputs use `rounded-input` (10px), cards `rounded-card` (14px) and modals `rounded-modal` (20px).
- **Input and secondary-button borders** use `border-control` (#878e99, 3:1 on white).
- **Text** is never lighter than `text-gray-500`.
- **Top bar:** `components/app-header.tsx`, the same in every tool. It has the logo tile, "Loopdesk AI / <Tool>", the tool switcher (`lib/hub/switcher.ts`, always all 7 tools in the same order), the page pills, the business name and Log out.
- **Logo files** are in `public/brand/`, copied unchanged from santwayne/loopdesk-ai-website. Never recolour the logo or put it straight on the crimson bar.
