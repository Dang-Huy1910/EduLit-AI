---
name: EduLit Serene Paper
colors:
  surface: '#f8f9ff'
  surface-dim: '#d0dbed'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dee9fc'
  surface-container-highest: '#d9e3f6'
  on-surface: '#121c2a'
  on-surface-variant: '#50453b'
  inverse-surface: '#27313f'
  inverse-on-surface: '#eaf1ff'
  outline: '#82756a'
  outline-variant: '#d4c4b7'
  surface-tint: '#7d562d'
  primary: '#7d562d'
  on-primary: '#ffffff'
  primary-container: '#d4a373'
  on-primary-container: '#5b3912'
  inverse-primary: '#f0bd8b'
  secondary: '#006780'
  on-secondary: '#ffffff'
  secondary-container: '#76dcff'
  on-secondary-container: '#006077'
  tertiary: '#1f6c3a'
  on-tertiary: '#ffffff'
  tertiary-container: '#72bd82'
  on-tertiary-container: '#004b22'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdcbd'
  primary-fixed-dim: '#f0bd8b'
  on-primary-fixed: '#2c1600'
  on-primary-fixed-variant: '#623f18'
  secondary-fixed: '#b7eaff'
  secondary-fixed-dim: '#6cd3f7'
  on-secondary-fixed: '#001f28'
  on-secondary-fixed-variant: '#004e61'
  tertiary-fixed: '#a6f4b5'
  tertiary-fixed-dim: '#8bd79b'
  on-tertiary-fixed: '#00210b'
  on-tertiary-fixed-variant: '#005226'
  background: '#f8f9ff'
  on-background: '#121c2a'
  surface-variant: '#d9e3f6'
typography:
  display-lg:
    fontFamily: Merriweather
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 48px
  display-lg-mobile:
    fontFamily: Merriweather
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 38px
  headline-lg:
    fontFamily: Merriweather
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 40px
  headline-md:
    fontFamily: Merriweather
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 32px
  headline-sm:
    fontFamily: Merriweather
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 28px
  literary-body-lg:
    fontFamily: Merriweather
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 32px
  literary-body-md:
    fontFamily: Merriweather
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  caption:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  margin: 2rem
  margin-sm: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

### Personality & Direction
The design system embodies a calm, contemplative, and pedagogically rigorous atmosphere tailored for high school literature studies under the Vietnam 2018 General Education Program (GDPT 2018). It translates the physical texture and serenity of traditional print anthologies into a modern digital workbench. The emotional intent is to lower cognitive fatigue, invite deep textual immersion, and offer constructive, humane feedback.

### Visual Style
- **Paper-First Editorial Minimalism:** The digital surface reflects tactile, unbleached warm ivory paper (`#FFFDF7`) paired with crisp pure-white reading cards (`#FFFFFF`).
- **Pedagogical Balance:** Literary authenticity is anchored by a refined serif typography for creative texts, essay prompts, and literary excerpts, counterbalanced by a utilitarian sans-serif for annotations, grading rubrics, and system controls.
- **Subdued Harmony:** Warm terracotta-sand tones serve as the primary action anchor, while deep oceanic blues provide non-intrusive metadata focus and academic precision.

## Colors

### Palette Configuration
- **Base Canvas (`#FFFDF7`):** Warm ivory paper tone that mitigates screen glare during prolonged reading and writing sessions.
- **Card & Dialog Surface (`#FFFFFF`):** High-clarity white surface dedicated to essay drafting, grading rubrics, and comparison views.
- **Primary CTA (`#D4A373`):** Warm sand tone designed for core actions (e.g., nộp bài, chấm điểm, lưu bản nháp), paired strictly with high-contrast text (`#1F2937`).
- **Ocean Accent (`#0891B2` / `#0E7490`):** Analytical focal color for AI annotations, grammatical/rhetorical flags, and academic links.
- **Semantic Roles:**
  - **Success / Phê duyệt (`#166534`):** Forest green for mastery benchmarks and exemplary commentary.
  - **Warning / Lưu ý (`#CA8A04`):** Warm amber on soft yellow tint (`#FEF9C3`) for stylistic or structural suggestions.
  - **Error / Cần sửa đổi (`#DC2626`):** Precision crimson for syntactic or factual discrepancies.
- **Neutral Scales:**
  - Body text: `#1F2937` (Charcoal primary)
  - Secondary metadata & rubrics: `#4B5563` (Cool slate secondary)
  - Dividers: `#E5E7EB`
  - Input Borders: `#9CA3AF`

## Typography

### Structural Logic
- **Serif Domain (Merriweather):** Assigned strictly to essay titles, excerpt blocks (đoạn trích dẫn), primary writing prompts, and reflective critique. Long literary passages enforce an open line-height ratio of 1.6 to 1.75 to mimic traditional Vietnamese pedagogical anthologies and prevent line-jumping.
- **Sans-Serif Domain (Inter):** Assigned to analytical metrics, evaluation criteria (rubrics), form controls, system navigation, and AI assistant dialogues.
- **Vietnamese Diacritics Care:** Both Merriweather and Inter feature robust full-form tone-mark anchors. Line heights maintain ample vertical head-room to prevent tone collision with uppercase marks (`Đ`, `Ả`, `Ỡ`, `Ứ`).

## Layout & Spacing

### Grid & Ergonomics
- **Reading Container Max-Width:** The analytical and reading pane restricts maximum text width to `720px` (approximately 65–75 characters per line) to preserve syntactic comprehension.
- **Dual-Pane Split (Desktop):** A 12-column layout dividing into a 7-column primary literary/essay workspace and a 5-column AI evaluation and rubric drawer, separated by a distinct `1px` border (`#E5E7EB`).
- **Adaptive Reflow:**
  - **Desktop (≥ 1024px):** Dual-pane persistent layout, 24px gutter, 32px canvas margins.
  - **Tablet (768px - 1023px):** Collapsible analysis drawer, 16px gutter, 24px margins.
  - **Mobile (< 768px):** Single vertical stack with bottom-sheet AI annotations, 16px margins.

## Elevation & Depth

### Philosophy: Tonal Surfaces & Paper-Edge Layering
Rather than aggressive drop shadows, depth reflects subtle layered stationary.

- **Level 0 (Canvas):** `#FFFDF7` base backdrop. Flat.
- **Level 1 (Cards & Worksheets):** `#FFFFFF` surface bounded by a crisp `1px solid #E5E7EB` border. Shadow is quiet and diffused: `0 1px 3px rgba(31, 41, 55, 0.04), 0 1px 2px rgba(31, 41, 55, 0.02)`.
- **Level 2 (Popovers, AI Suggestion Tooltips):** `#FFFFFF` surface with `0 4px 12px rgba(31, 41, 55, 0.08)` and border `1px solid #E5E7EB`.
- **Level 3 (Modal Dialogs & Scoring Overlays):** `#FFFFFF` surface with `0 12px 32px rgba(31, 41, 55, 0.12)`, anchored by a soft scrim of `rgba(31, 41, 55, 0.4)`.

## Shapes

### Geometric Values
- **Inputs & Action Triggers:** Standardized at `8px` (`0.5rem`) for compact structural integrity and focus alignment.
- **Cards, Panels & Dialog Sheets:** Standardized at `12px` (`0.75rem`) to create soft, non-intrusive container framing that feels like high-grade stationery.
- **Pills / Tags / Metatags:** Full rounding (`9999px`) for contextual badges, grammar criteria, and scoring chips.

## Components

### Buttons
- **Primary CTA:**
  - Background: `#D4A373`, Text: `#1F2937` (Font: Inter, 600 weight, 14px), Radius: `8px`, Padding: `10px 20px`.
  - Hover: `#C59260`. Active: `#B68252`.
  - Focus-visible: Outline `2px solid #0891B2` with `2px` offset.
  - Disabled: `#E5E7EB`, text `#9CA3AF`, cursor: not-allowed.
  - Loading: `#D4A373` with an embedded spinning charcoal ring; text dimmed.
- **Secondary (Outline):**
  - Background: Transparent, Border: `1px solid #D4A373`, Text: `#1F2937`.
  - Hover: Background `#FFFDF7`, border `#C59260`.
- **Ghost (Inline Actions):**
  - Background: Transparent, Text: `#0E7490`.
  - Hover: Background `rgba(8, 145, 178, 0.08)`.

### Input Fields & Essay Textareas
- **Input Field:**
  - Background: `#FFFFFF`, Border: `1px solid #9CA3AF`, Radius: `8px`, Text: `#1F2937`, Placeholder: `#9CA3AF`.
  - Height: `42px`, Padding: `8px 12px`.
  - Focus: Border `#0891B2`, Box-shadow: `0 0 0 3px rgba(8, 145, 178, 0.15)`.
  - Error: Border `#DC2626`, Box-shadow: `0 0 0 3px rgba(220, 38, 38, 0.15)`.
- **Essay Canvas (Văn bản bài làm):**
  - Background: `#FFFFFF`, Border: `1px solid #E5E7EB`, Padding: `24px 32px`, Radius: `12px`.
  - Text typography uses `literary-body-lg` (Merriweather, 18px, 1.75 line-height).

### Cards & Reading Panes
- **Card:**
  - Background: `#FFFFFF`, Border: `1px solid #E5E7EB`, Radius: `12px`, Padding: `24px`.
- **Excerpt Block (Khung trích dẫn ngữ liệu):**
  - Background: `#FFFDF7`, Border-left: `4px solid #D4A373`, Border-top/right/bottom: `1px solid #E5E7EB`, Radius: `0 8px 8px 0`, Padding: `16px 20px`.
  - Font: Merriweather, Italic, 16px, line-height 1.7.

### Chips & Rubric Tags
- **Rubric Badge:**
  - Height: `24px`, Radius: `9999px`, Padding: `2px 10px`, Font: Inter, 12px, 500.
  - Informational: Background `rgba(8, 145, 178, 0.1)`, Text: `#0E7490`.
  - Dat tieu chuan (Success): Background `rgba(22, 101, 52, 0.1)`, Text: `#166534`.
  - Can luu y (Warning): Background `#FEF9C3`, Border: `1px solid #FDE047`, Text: `#CA8A04`.

### Checkboxes & Radio Controls
- **Size:** `18px x 18px`, Border: `1.5px solid #9CA3AF`, Radius: `4px` (Checkbox) / `50%` (Radio).
- **Checked State:** Background `#0891B2`, Border: `#0891B2`, Icon/Dot: `#FFFFFF`.
- **Focus:** `0 0 0 3px rgba(8, 145, 178, 0.2)`.

### Literary Annotation Highlight (AI Feedback Inline)
- **Inline Text Highlight:** Background `rgba(8, 145, 178, 0.14)`, Border-bottom: `2px solid #0891B2`. Cursor: pointer.
- **Hover/Active State:** Background `rgba(8, 145, 178, 0.24)`. Triggers an anchored context drawer displaying pedagogical remarks, rhetorical device analysis, and scoring guidelines.