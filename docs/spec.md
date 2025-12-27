# BotCat — Chat UI (Stage 1) + Transcript pipeline

> This spec is the **single source of truth**.

---

## Consent-triggered finalization (addendum, Stage 1)

When (and only when) the user clearly and affirmatively requests to send the prepared order to FairyPlace™ designers, or agrees to BotCat’s suggestion to do so, BotCat MUST emit the exact marker:

- `[[CONSENT_TRUE]]`

This marker is a machine-readable trigger for the backend orchestrator.

Orchestrator behavior:
- Upon detecting `[[CONSENT_TRUE]]`, the orchestrator MUST immediately trigger finalization (generate artifacts and send the internal email).
- After the internal email is successfully sent, the orchestrator MUST return `ok=true` to BotCat.

BotCat user-facing behavior:
- BotCat MUST inform the user about successful sending **only after** it receives `ok=true`.
- If finalization fails, BotCat MUST respond with a single, fixed error message (no retries, no speculative suggestions) and provide these contacts:
  - Email: `fairyplace.tm@gmail.com`
  - Website: `www.fairyplace.biz`

System messages (EN only):
- Success: "Your order has been successfully sent to FairyPlace™ designers. The designers will contact you as soon as possible."
- Failure: "Unfortunately, we could not forward your order to FairyPlace™ designers. However, you can contact them directly via email at fairyplace.tm@gmail.com or via the contacts on the website www.fairyplace.biz."

After a failed consent-triggered attempt:
- The orchestrator MUST continue operating under normal finalization triggers (user left / New Chat / 1h inactivity).

---

# Tech_Spec_v1

3.2.6. Dynamic Model Selection

(See the full document history in docs/spec_initial.md. This file is intentionally concise and focuses on the operational single source of truth.)
