# Nearby-Nearby — CSS & Coding Conventions

Working notes on how this codebase is styled and structured, based on working directly in it with Barry. Meant as a shared reference for design/dev conversations (Rhonda, Manav's team, etc.).

## 1. CSS/SCSS architecture

- **Single source file:** all styles live in one monolithic `nearby-app/app/src/styles/app.scss` (compiled to `app.css`). The project went through a phase of splitting into per-component SCSS files (2026-06-13 refactor), then got merged back into one file by a later pass — that merge is why some duplicate/conflicting selectors existed until a 2026-07-23 cleanup. There is no per-component SCSS anymore.
- **Compilation is automatic** — VS Code's Live Sass Compile watches `app.scss` and regenerates `app.css` on save. No manual build step.
- **Tokens live at the top of the file.** All SCSS `$variables` (brand colors, fonts, spacing) and the `:root` CSS custom-property mirror sit in one TOKENS block at the very top of `app.scss`, after `@use 'sass:color'`. Variables must be defined before use.
- **Preferred syntax: `$variable`, not `var(--name)`.** Barry's explicit preference. SCSS functions like `color.adjust()` only work on `$variables` anyway. The `var(--x)` custom-property mirror exists as a future dark-mode/runtime-theming hook, not in active use.
- **Original source of truth:** Barry's hand-authored templates live outside the app at `nn-templates/inc/` (`stylez.scss`, `options.scss`, etc.) — these are the design originals. When something in `app.scss` looks wrong, that's the place to diff against.

## 2. Media queries

- **Always nested inside the selector**, never flat top-level blocks:
  ```scss
  // correct
  .my_class {
    padding: 10px;
    @media (min-width: 1200px) { padding: 20px; }
  }
  ```
  (Only exception: `@keyframes` can't be nested, so animation blocks stay flat.)
- **Standard breakpoint sequence**, always ascending within a block:
  `600 → 700 → 768 → 800 → 980 → 1200 → 1300 → 1400 → 1600 → 1900 → 2400`
  Mobile-first (`min-width`) means an out-of-order breakpoint silently overrides a later one at the same specificity — this caused real bugs before.
- **Empty scaffolded breakpoints are intentional**, not dead code:
  ```scss
  @media(min-width:600px) {  }
  @media(min-width:700px) {  }
  ```
  Barry pre-scaffolds every standard breakpoint on a selector so it's ready to fill in later. Never flag/remove these as cleanup — only flag a breakpoint block if it has *real conflicting declared values* vs. another copy of the same selector.

## 3. Class & ID naming

- **Underscores, not hyphens**, for the `poi_` prefix and generally throughout: `poi_detail_page`, not `poi-detail-page`.
- **Double-underscore BEM separators are fine and expected**: `poi_detail__container`.
- IDs and classes elsewhere in the codebase (from Barry's original templates) mostly follow the same underscore convention: `#one_search_map_results`, `.one_search_map_result_single`, `.wrapper_default`, `.title_style_3`, etc.
- Component-scoped prefixes exist for some detail-page work (e.g. `td-*` for Trail Detail) — some of these became dead code and were removed during cleanup; if reviving old markup, check it's still referenced before trusting the class name.

## 4. Standard page template

Every inner page follows one structure (from `nn-templates/default-page-01.html`):

```jsx
<>
  <header className="page_header_style_1">
    <div className="wrapper_default">
      <h1 className="page_title">Page Title</h1>
      <p className="page_excerpt">Short subtitle.</p>
    </div>
  </header>

  <div className="main_content_padding">
    <div className="wrapper_default">
      <h2 className="title_style_3">Section Heading</h2>
      <p>Body content...</p>
    </div>
  </div>
</>
```

- Don't wrap sections in `<section>` tags — flat structure inside `wrapper_default`.
- Watch for CSS sibling combinators (`ul + h2`) — they only fire on true DOM siblings. If content sits in separate wrapper divs, the selector silently does nothing; use a utility class instead.

## 5. Buttons

- All button classes (`.btn_reset`, `.btn_default`, `.btn_outline_purple`, `.btn_outline_teal`, `.btn_search`, `.btn_subscribe`, `.one_search_button*`, etc.) live in `app.scss` (formerly a dedicated `buttons.scss`, since merged in).
- **`.btn_reset` must always be declared first**, before every other button class. It sets `background: transparent; border: 0; border-radius: 0`. If another button class is declared before it, `.btn_reset`'s zeroed-out properties override the intended style on equal specificity.

## 6. Icons

- **Lucide (`lucide-react`) is the icon library, outline/stroke variants only** — never filled/solid variants, even if a library offers both.
- Lucide icons render via `stroke`, not `fill` (they ship with `fill="none"` baked in). Style them with `stroke: <color>` or set `color` on the parent to use `stroke="currentColor"`. Setting `fill` does nothing.
- Exception: some legacy CSS classes (e.g. `.poi_button_icon`) were written for older custom fill-based SVGs and still set `fill: $color`. A Lucide icon dropped into one of those classes needs an explicit `style={{ fill: 'none' }}` override, or it renders solid.

## 7. Accordions

- Accordion markup requires the wrapper div to carry **both** `poi_accordion_parent` and `accordionjs` classes — styles are (meant to be) scoped under `.accordionjs`, so omitting it breaks visuals while leaving functionality intact.
- Current state (as of the 2026-07-23 merge) has accordion base rules living unscoped in `app.scss` rather than properly scoped under `.accordionjs` — works today because nothing else collides with those class names, but it's a drift from the original architecture worth cleaning up eventually.

## 8. Grid/layout utilities

- Global layout utility classes — `.basic_column_parent`, `.column_grid_5050`, `.acc_content_group`, `.acc_list_group_1` — belong in one place only (originally `stylez.scss`, now the equivalent section of `app.scss`). Don't redefine them in a component-specific spot; only compound/modifier selectors that build on top of them belong locally.

## 9. Things that look like bugs but aren't

- `font-weight: bold;` immediately followed by `font-weight: 700;` in the same block — intentional fallback stacking (keyword first in case the font hasn't loaded, numeric weight second for precision). Not a duplicate to clean up.
- Empty scaffolded `@media` blocks (see §2).
- A stray `background-color: $gray7` on `#one_search_map_results` re-appearing after a merge — matches a documented specificity fix, not an accidental duplicate.

## 10. Status/badge colors — AAA accessibility

- **Colored status badges/pills use white background + colored text + colored border (outline) — never a tinted/translucent colored background.** A colored fill behind colored text is much more likely to fail AAA contrast, especially at small badge font sizes. White background keeps contrast high and predictable regardless of which status color is used.
  ```scss
  // correct
  .status-badge--closed {
    background-color: #ffffff;
    color: $red2;
    border: 1px solid $red;
  }

  // wrong — tinted background, don't use
  .status-badge--closed {
    background-color: rgba($red, 0.1);
    color: $red2;
  }
  ```
- This mirrors the existing trail-difficulty badge pattern (`$trail_difficulty_easy_bg: #ffffff`, etc.) — that one already established the convention; apply it to any new status/badge work (e.g. the Hours holiday-status pills).
- Applies to any semantic status coloring (open/closed/modified, difficulty, verified, etc.), not just one component.

## 11. General working style

- Barry authors CSS/SCSS live in VS Code while changes are also being made in the same repo — uncommitted `.scss` changes in the working tree should always be treated as his and preserved, never reverted or discarded without asking first.
- Work accumulates on one local branch per "wave" of fixes so everything stays visible in the running app; commits/PRs get split out per-issue only once a wave is confirmed done — not continuously.
