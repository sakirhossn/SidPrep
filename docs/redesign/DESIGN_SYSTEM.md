# SidPrep 2.0 — Design System Reference (Ink & Moss v2)

**Visual Direction:** SidPrep Ink & Moss v2  
**Governing Tokens:** `04_Design_Tokens.json` & `06_Visual_Design_Rationale.md`  
**Package:** `@sidprep/design-tokens`

---

## 1. Palette Specification

No blue or indigo branding, decorative highlights, or button styles are permitted.

| Token | Hex | Role | Contrast Ratio |
|---|---|---|---|
| `primary` | `#28563F` | Forest Primary action & active tab highlight | 6.4:1 on warm paper (WCAG AA pass) |
| `primaryPressed` | `#183D2B` | Pressed action state | High contrast |
| `hero` | `#1E3C2C` | Charcoal Hero card surface | Used on dark focus cards |
| `highlight` | `#DFF19B` | Restrained citrus accent pill / indicator | High contrast against charcoal hero |
| `background` | `#F7F7F2` | Warm paper mobile canvas | Soft, non-glare reading surface |
| `canvas` | `#F4F3EE` | Web desk canvas | Neutral light |
| `surface` | `#FFFFFF` | Clean white cards & modal sheets | Crisp content containers |
| `surfaceSubtle` | `#EFF1E9` | Secondary card background | Soft separation |
| `text` | `#20291F` | Near-black forest ink headings & body | 11.8:1 on white (WCAG AAA pass) |
| `textMuted` | `#66716A` | Descriptions, timestamps, metadata | 4.8:1 on white |
| `border` | `#E6E8DE` | Muted card and input borders | Subtle outline |
| `success` | `#24734E` | Official verified status & positive marks | High contrast green |
| `warning` | `#9B642D` | Pending sync & streak indicators | Earth amber |
| `error` | `#B5483F` | Negative marks & genuine network errors | Crimson red |

---

## 2. Typography Architecture

- **Primary Latin Family:** **Manrope** (geometric, highly legible at small sizes without excessive width).
- **Indic Script Support:**
  - Hindi: **Noto Sans Devanagari**
  - Bengali: **Noto Sans Bengali**
  - Platform System Fallback
- **Scale (sp/dp):**
  - `micro`: 10sp (badges and short uppercase tags only)
  - `caption`: 12sp (metadata and timer indicators)
  - `body`: 14sp (standard reading copy)
  - `bodyComfortable`: 15sp (question body and passage text)
  - `subtitle`: 16sp (subheadings and button labels)
  - `sectionTitle`: 18sp (module headers)
  - `screenTitle`: 23sp (top screen title)
  - `heroTitle`: 26sp (hero countdown numbers)

---

## 3. Spacing & Touch Ergonomics

- **Grid Base:** 8dp layout grid with 4dp micro steps.
- **Minimum Tap Target:** **48dp** for all primary interactive controls and bottom navigation tabs.
- **Corner Radii:**
  - `chip`: 7dp
  - `input`: 12dp
  - `action`: 12dp
  - `card`: 18dp
  - `hero`: 19dp
  - `sheet`: 24dp
