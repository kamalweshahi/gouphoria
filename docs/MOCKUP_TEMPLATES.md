# Realistic phone-case mockup templates

Mockups are deterministic backend derivatives. AI generates only the standalone printable artwork; the template compositor never edits or overwrites that artwork.

The active template is `reference-photo-full-bleed-v8`, mapped only to exact models in `backend/src/services/phone-model-mockups.ts`. Its visual shell source remains the customer-supplied `backend/assets/mockups/iphone-reference.jpg`. The photo supplies the case shell, buttons, background, and hardware depth. The selected model supplies explicit printable-panel, safe-area, button-zone, and camera geometry; unsupported or ambiguous model names return `unsupported-model` and never inherit another model's geometry. The template defines:

- a 900 × 1200 crop of the supplied base photograph;
- a proportional cover crop with 18-pixel overscan and centered focal placement;
- a model-specific printable-back path, rounded corners, safe area, button exclusion zones, and registered camera opening;
- a subtle clipped matte texture, edge shading, and reflection layer above the artwork;
- an artwork-aware protective rim, shell highlight, and soft product shadow derived from a preview-only dominant color sample;
- a model-specific camera module, lens, flash, sensor, and corner-radius configuration;
- unchanged photographed buttons and base product geometry.

The compositor resolves the complete normalized model name—never partial words such as `Pro` or `Max`—then proportionally cover-crops a preview copy across the selected printable-back path. The full-bleed artwork covers the fixed source-photo camera outside the selected model's opening; surface effects are clipped to the printable panel; the adaptive physical rim remains above the print; and the unchanged registered camera layer remains above them. Safe-area metadata never creates visible whitespace. Extreme source aspect ratios are returned with a `needs-review` placement flag instead of silently modifying artwork content. The original artwork file is never rewritten.

`ai_designs.current_artwork_key` remains the authoritative printable file. `mockup_key`, `mockup_template_id`, `artwork_placement`, and `mockup_generated_at` describe the preview. Generation metadata records `normalizedPhoneModel`, `cameraTemplateId`, and `shellTemplateId` for debugging. Existing carts and orders retain separate artwork and mockup keys. The startup backfill regenerates legacy previews and updates only matching preview references; it never changes artwork, credits, generation counts, payment records, fulfillment state, or Printify mappings. Set `MOCKUP_BACKFILL_ENABLED=false` only when a deployment must defer that idempotent backfill.
