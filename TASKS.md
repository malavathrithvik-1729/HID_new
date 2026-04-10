# V-Med Feature & Stabilization Task File

This file tracks implementation work for Patient + Doctor dashboard expansion.

## Phase 1 — Foundation (in progress)
- [x] Improve language engine fallback behavior and interpolation safeguards.
- [x] Localize newly added UX strings (shortcut tip + offline banner).
- [ ] Add centralized error helpers for user-safe UI messaging.
- [ ] Add shared service layer (`services/`) for API + Firestore reads.

## Phase 2 — Patient Features
- [ ] Digital Health ID profile completeness checks + progress meter.
- [ ] Health dashboard trends (BP/sugar/heart-rate) with interactive charts.
- [ ] AI-assisted alerts (rule-based guardrails first, model-assisted second).
- [ ] Medication reminders (schedule + due/overdue UI).
- [ ] Health score system with explainable scoring breakdown.
- [ ] Document vault improvements (search, filters, tags, pagination).
- [ ] SOS emergency mode hardening (offline-ready QR payload + contacts).
- [ ] Blood donor network (distance + availability filters).
- [ ] Predictive trend alerts (risk thresholds + confidence indicator).
- [ ] Wearable sync abstraction (import + connector stubs).

## Phase 3 — Doctor Features
- [ ] Unified patient timeline with grouped events.
- [ ] AI-assisted risk insights panel (non-diagnostic wording).
- [ ] Smart alerts queue (critical flags first).
- [ ] Diagnosis assistant (suggestion + rationale + disclaimer).
- [ ] Lab trend integration panel.
- [ ] Structured doctor notes & follow-up planner.
- [ ] Population insights demo widgets.

## Phase 4 — Security / Backend / Quality
- [ ] Role-based auth gates for patient/doctor/admin.
- [ ] Backend service completion (Firestore-first, optional Mongo adapter).
- [ ] Access controls + audit logging for sensitive actions.
- [ ] Replace risky “AI treatment advice” language with “AI-assisted insights”.
- [ ] Improve mobile responsiveness + lazy loading/pagination.
- [ ] Add smoke tests for critical flows.

## Notes
- Scope is intentionally phased: production-safe increments over all-at-once rewrite.
- Any new AI feature must keep explicit clinical disclaimer text in UI.
