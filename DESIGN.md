---
name: Reva Health Exporter
colors:
  surface: '#f2fbfb'
  surface-dim: '#d3dcdc'
  surface-bright: '#f2fbfb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#ecf5f5'
  surface-container: '#e7f0ef'
  surface-container-high: '#e1eaea'
  surface-container-highest: '#dbe4e4'
  on-surface: '#151d1d'
  on-surface-variant: '#3e4949'
  inverse-surface: '#293232'
  inverse-on-surface: '#e9f2f2'
  outline: '#6e7979'
  outline-variant: '#bec9c8'
  surface-tint: '#00696a'
  primary: '#005152'
  on-primary: '#ffffff'
  primary-container: '#006b6c'
  on-primary-container: '#98e8e9'
  inverse-primary: '#83d4d4'
  secondary: '#4a6363'
  on-secondary: '#ffffff'
  secondary-container: '#cce8e7'
  on-secondary-container: '#506969'
  tertiary: '#2f4b62'
  on-tertiary: '#ffffff'
  tertiary-container: '#47637b'
  on-tertiary-container: '#c1dffb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9ff0f1'
  primary-fixed-dim: '#83d4d4'
  on-primary-fixed: '#002020'
  on-primary-fixed-variant: '#004f50'
  secondary-fixed: '#cce8e7'
  secondary-fixed-dim: '#b1cccb'
  on-secondary-fixed: '#051f20'
  on-secondary-fixed-variant: '#324b4b'
  tertiary-fixed: '#cce5ff'
  tertiary-fixed-dim: '#adcae5'
  on-tertiary-fixed: '#001e31'
  on-tertiary-fixed-variant: '#2d4960'
  background: '#f2fbfb'
  on-background: '#151d1d'
  surface-variant: '#dbe4e4'
typography:
  display-sm:
    fontFamily: Roboto Flex
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: 0px
  headline-md:
    fontFamily: Roboto Flex
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0.15px
  headline-sm:
    fontFamily: Roboto Flex
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0.15px
  title-lg:
    fontFamily: Roboto Flex
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: 0.15px
  title-md:
    fontFamily: Roboto Flex
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.1px
  body-lg:
    fontFamily: Roboto Flex
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0.25px
  body-md:
    fontFamily: Roboto Flex
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.25px
  label-lg:
    fontFamily: Roboto Flex
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.4px
  label-md:
    fontFamily: Roboto Flex
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.5px
  label-sm:
    fontFamily: Roboto Flex
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.5px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-base: 1rem
  space-lg: 1.25rem
  space-xl: 1.5rem
  space-2xl: 2rem
  margin-mobile: 1rem
  gutter-mobile: 0.5rem
---

## Brand & Style

The design system establishes a clinical, trustworthy, and utilitarian experience tailored for an Android 11+ health records data-transfer bridge. It serves patients, clinical trial participants, and privacy-conscious users transferring encrypted health datasets between native storage and authenticated medical cloud vaults. 

The aesthetic is grounded in **Modern Utility & Pragmatic Material Design**. It decisively strips away gamification, decorative fitness charts, celebratory streaks, and emotional health marketing. Instead, it elevates systemic transparency, transaction state reliability, and calm structural precision. Visual feedback focuses on operation integrity, sync completeness, and explicit status communication.

## Colors

The color palette prioritizes clinical sobriety, screen readability in clinical settings, and non-distracting visual hierarchy:

- **Primary (`#006B6C`) & Primary Container (`#CCE8E8`)**: Anchors critical pipeline actions (sync confirmations, export initiations, active toggles). The muted deep teal communicates clinical sterility and precision.
- **Secondary (`#4A6363`)**: Used for supportive operational controls, non-primary category tabs, and inactive process markers.
- **Neutral Dark Typography (`#191C1D` / `#404848`)**: High-contrast text guarantees compliance with WCAG AAA accessibility thresholds across variable brightness conditions.
- **Surfaces (`#F8FAFA` canvas, `#FFFFFF` cards, `#EDF2F2` subtle borders)**: Employs gentle tone steps to define functional modules without harsh contrasts or elevation glare.

### Status Palette & Visual Rules
Status states rely on dual encoding—never color alone. Each status pairs an intentional token container with its dedicated iconography and persistent label:
- **Complete**: `#006B6C` text/icon on `#CCE8E8` container with a checkmark badge.
- **Partial**: `#7C5800` text/icon on `#FFDEA1` container with a half-filled split glyph.
- **Not Uploaded / Failed**: `#BA1A1A` text/icon on `#FFEDEA` container with a high-contrast exclamation/warning mark.
- **Pending / In Progress**: `#4A6363` text/icon on `#E0E5E5` container with a continuous circular progress track.
- **No Records**: `#5A6060` text/icon on `#E7ECEC` with an em-dash glyph.
- **Unknown / Unchecked**: `#5A6060` on transparent bordered chip with a question symbol.

## Typography

Typography relies strictly on **Roboto Flex** to match Android 11 system conventions. Letterforms prioritize immediate scanning speed, high tabular figure legibility (file sizes, record quantities, timestamps), and strict horizontal alignment across device screen sizes.

- Headings avoid dramatic scaling; `display-sm` tops out at 24px to ensure utility screens maintain high information density without unnecessary scrolling.
- Body copy uses `body-lg` (15px) and `body-md` (13px) calibrated for clean horizontal baseline rhythm.
- `label-md` and `label-sm` govern status badges, system flags, and metadata hashes. These levels use medium/semibold weights with positive letter tracking to prevent visual crowding in dense file directories.

## Layout & Spacing

The layout model implements a structured, fluid single-column hierarchy on mobile displays, bounded by an **8pt master grid** with a **4pt micro-subgrid** for component-internal alignment.

- **Screen Margins**: Uniform 16px (`space-base`) horizontal gutter padding on standard mobile viewports, scaling up to 24px on tablets or wide foldables.
- **Vertical Rhythm**: 8px intervals between related content elements within cards; 12px to 16px intervals separating distinct dataset containers.
- **Layout Confinement**: Health record lists and export targets are arranged in strict full-width or bounded card modules, preventing staggered alignment or uneven eye movement during batch data reviews.

## Elevation & Depth

This design system deliberately minimizes physical drop shadows to reinforce its utility and battery-friendly profile, adopting **tonal separation and thin structural containment**:

- **Level 0 (App Canvas)**: Base surface filled with `#F8FAFA`. No elevation.
- **Level 1 (Card & Module Layer)**: Clean white `#FFFFFF` bounded by a crisp 1px stroke of `#EDF2F2`. Flat resting state with no blur shadows.
- **Level 2 (Active/Selected Card, Sheet Dialogs)**: `#FFFFFF` surface with an accent border tint (`#BFC8C8`) and a crisp, low-intensity ambient shadow: `box-shadow: 0px 1px 3px rgba(25, 28, 29, 0.08), 0px 1px 2px rgba(25, 28, 29, 0.04)`.
- **Level 3 (Modal Bottom Sheets / Sticky Action Bars)**: Raised navigation panels anchor the lower screen with a soft top edge outline (`#EDF2F2`) and an ambient blur: `box-shadow: 0px -2px 8px rgba(0, 0, 0, 0.04)`.

## Shapes

The interface embraces a measured **Rounded (`roundedness: 2`)** aesthetic, adhering directly to Android 11 / Material 3 utility guidelines:

- **Cards & Data Modules**: Standard 8px (`0.5rem`) corner radius. This keeps the edges tidy and maximizes internal area for tabular data presentation.
- **Status Indicator Badges & Chips**: 4px to 6px corner radius for compact metadata capsules; full pill shapes (`9999px`) are reserved only for transient state filter chips.
- **Action Buttons**: 8px (`0.5rem`) radius for standard buttons and system toggles to maintain consistency with enclosing card frames.
- **Checkboxes**: 2px subtle radius with 2px stroke weight for strict mechanical precision.

## Components

### Action Buttons
- **Primary Button**: Background `#006B6C`, text `#FFFFFF`, height 44px, border-radius 8px. Font weight 600 (`label-lg`). Ripple state incorporates a subtle overlay of `#CCE8E8` at 20% opacity.
- **Secondary / Outlined Button**: Background transparent, border 1px solid `#BFC8C8`, text `#006B6C`. Height 44px, border-radius 8px.
- **Utility / Bulk Action Button**: Background `#EDF2F2`, border none, text `#191C1D`, height 36px, horizontal padding 12px.

### Status Indicator Badges
Compact, dual-encoded chips with fixed 24px heights:
- **Upload Complete**: Background `#CCE8E8`, text `#006B6C`, leading icon: 14px solid checkmark (`check_circle`).
- **Partial**: Background `#FFDEA1`, text `#7C5800`, leading icon: 14px half-circle/split mark (`timelapse`).
- **Not Uploaded**: Background `#FFEDEA`, 1px dashed border `#BA1A1A`, text `#BA1A1A`, leading icon: 14px triangle alert (`error_outline`).
- **Pending**: Background `#E0E5E5`, text `#4A6363`, leading icon: 14px animated rotating circle loader (`sync`).
- **No Records**: Background `#E7ECEC`, text `#5A6060`, leading icon: 14px horizontal bar (`remove`).
- **Unknown**: Background transparent, 1px solid `#BFC8C8`, text `#707979`, leading icon: 14px circular question mark (`help_outline`).

### Data Record Cards
- Background `#FFFFFF`, 1px solid `#EDF2F2` perimeter border, padding 12px 16px.
- Arranged with record title on the left (`title-md`), synchronized timestamp and payload size below it (`body-md`), and the status badge pinned to the top-right corner.

### Checkboxes & Selection Controls
- Checkbox dimensions: 18x18px.
- Active state: `#006B6C` filled square with crisp white checkmark vector.
- Inactive state: 2px border `#6F7979` with transparent center.
- Indeterminate state: `#006B6C` filled square with centered horizontal bar.

### Input Fields (Export Filtering & Target Configuration)
- Resting state: Container background `#FFFFFF`, border 1px solid `#BFC8C8`, corner radius 8px, padding 12px 16px, text `#191C1D`.
- Focused state: Border 2px solid `#006B6C` with zero shadow glow.
- Helper & Validation Text: Rendered below input in `label-sm` (4px margin-top), using `#404848` for guidance or `#BA1A1A` for format errors.

### Batch Progress Bar
- Total track: Height 6px, background `#EDF2F2`, border-radius 3px.
- Progress indicator: Flat fill `#006B6C`, border-radius 3px, animated strictly via standard linear easing.
