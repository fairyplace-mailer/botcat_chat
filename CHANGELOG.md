# Changelog

## Unreleased

## 2025-12  Stage 1 stabilization

- `/api/bot/webhook` finalization pipeline stabilized and aligned to `docs/spec.md`.
- Internal email sending kept; client emails disabled.
- 4 transcript artifacts generated on Stage 1:
  - internal HTML (Blob)
  - internal PDF (Google Drive)
  - public/original HTML (Blob)
  - public/original PDF (Google Drive)
- PDF generation is performed from HTML (identical output).
- Static routes for artifacts added under `STATIC_BASE_URL`:
  - `/t/<chatName>/html`, `/t/<chatName>/pdf`
  - `/t/<chatName>/public/html`, `/t/<chatName>/public/pdf`
- Image previews for transcripts generated server-side (webp 600px 80KB target).
- TTL cleanup updated to include public HTML as well.
