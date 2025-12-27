# BotCat — Chat UI (Stage 1) + Transcript pipeline

> This spec is the **single source of truth**.

---

## 2) BotCat behavior (Stage 1)

### 2.1 Immediate finalization on user consent (MANDATORY)

In real life the user may explicitly ask to send the prepared order to FairyPlace™ designers, or may agree to BotCat’s suggestion to do so. This must be supported.

**Consent signal (BotCat → orchestrator):**
- When (and only when) the user’s intent is clear and affirmative, BotCat MUST emit the exact marker:
  - `[[CONSENT_TRUE]]`
- This marker is a machine-readable trigger for the orchestrator.

**Orchestrator behavior:**
- Upon detecting `[[CONSENT_TRUE]]`, the orchestrator MUST immediately trigger finalization:
  - call the webhook,
  - generate all required artifacts,
  - upload PDFs to Drive,
  - and send the internal email.
- After the internal email is successfully sent, the orchestrator MUST return `ok=true` to BotCat.

**BotCat user-facing behavior:**
- BotCat MUST inform the user about successful sending **only after** it receives `ok=true`.
- If finalization fails:
  - BotCat MUST inform the user that sending failed,
  - MUST apologize,
  - MUST provide contact coordinates and stop.

**Failure contact coordinates (MANDATORY):**
- Email: `fairyplace.tm@gmail.com`
- Website: `www.fairyplace.biz`

**Strict prohibitions (MANDATORY):**
- BotCat MUST NOT suggest:
  - “try again later”,
  - “repeat sending later”,
  - “contact designers”,
  - or any other speculative suggestions.

**After a failed consent-triggered attempt:**
- The orchestrator MUST continue operating under normal finalization triggers (user left / New Chat / 1h inactivity).

---

## (rest of spec unchanged)
