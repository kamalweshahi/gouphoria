# Release readiness and owner checklist

Last reviewed: 2026-07-20

This document separates application verification from external production authorization. A passing build or test suite does not by itself authorize real payment capture, print production, AI spend, or public launch.

## Application acceptance matrix

| Area | Automated evidence | Manual evidence required before launch |
| --- | --- | --- |
| Accounts and access | Registration/login/logout/session restore, password/session hashing, roles, ownership isolation | Create user/admin accounts over final HTTPS domain and verify cookie/proxy behavior |
| Catalog and variants | Phone-case filter, normalization, idempotent sync, availability/price updates, invalid pair rejection | Review all visible products/models/types against the intended Printify shop |
| Cart and orders | Persistent cart, immutable snapshots, owner-scoped expiring Printify quotes, integer-cent totals, mixed-order state transitions | Complete a representative standard and mixed cart in the launch browser/device matrix |
| PayPal | Server-created item/shipping breakdown, amount/currency verification, capture idempotency, ownership, existing endpoints | Sandbox payer approval and capture; then a separately authorized low-value live transaction |
| Printify | Dynamic quote mapping, saved shipping method, disabled-mode payload validation, retry/idempotency, HMAC webhook status sync | Draft order inspection, print-area check, each offered shipping method, webhook delivery, manual approval, and only then production-mode authorization |
| AI projects | Upload validation, moderation/provider adapters, credit idempotency, ownership, private assets | Confirm live model access, acceptable output, privacy/retention, quota/budget, timeout and moderation behavior |
| AI commerce/admin | Frozen snapshots, review transitions, admin-only assets/actions, audit history | Train reviewers; approve/reject test items; verify exact printable file and customer messaging |
| Paid credits | Package validation, backend price, capture/grant idempotency, ledger/admin audit | Sandbox payer approval/capture and reconciliation with the PayPal dashboard |
| Database | Existing-schema migrations, clean-schema bootstrap, constraints and integrity queries | Backup, restore rehearsal, staging migration, capacity and retention approval |
| UI/accessibility | Production build/lint, responsive browser smoke, semantic loading/error/status states | Keyboard and screen-reader review on final hosted build; legal/customer copy approval |
| Operations | Safe error responses, request limits, headers, no workspace build artifacts | TLS, monitoring, alerts, backups, incident process, secrets manager, and support ownership |

## Required owner actions

- [ ] Choose and approve the permanent brand, domain, support address, and legal business identity.
- [ ] Publish privacy, terms, AI-content, shipping, returns/refunds, and cancellation policies.
- [ ] Inventory all credentials. Rotate any value that may have been shared or exposed; do not expect the app to rotate credentials.
- [ ] Store production credentials outside source control and restrict who can read/change them.
- [ ] Replace development MySQL credentials and give the application only the grants it needs.
- [ ] Back up MySQL and private AI storage; perform and document a restore rehearsal.
- [ ] Run migrations on a staging clone and compare counts/constraints before production rollout.
- [ ] Set the exact HTTPS `CORS_ORIGINS`; configure trusted TLS termination and forwarded proxy headers.
- [ ] Complete PayPal sandbox payer approval/capture and refund/reconciliation procedures.
- [ ] Confirm PayPal live webhook/operational reconciliation strategy before accepting real customers.
- [ ] Configure a public HTTPS Printify callback URL and strong webhook secret, run the admin-only webhook sync, and verify signed retry delivery.
- [ ] Keep Printify fulfillment `disabled` until draft payload, print area, shipping, provider, and shop approval settings are verified.
- [ ] Obtain explicit authorization before switching Printify to `production`.
- [ ] Confirm OpenAI model availability, quota, budget alerts, privacy/retention terms, and acceptable-use handling.
- [ ] Configure shared rate limiting before running more than one API instance.
- [ ] Monitor API 5xx event IDs, payment failures, fulfillment failures, stuck pending reviews, database/volume capacity, and backup health.
- [ ] Define on-call/support ownership for payment disputes, failed fulfillment, AI review decisions, privacy requests, and account access.
- [ ] Execute keyboard, screen-reader, responsive-device, and final-host performance checks.
- [ ] Document rollback: application image rollback, database restore decision, fulfillment-mode disable, and customer communication.

## Known release blockers and tracked risks

- The verified local environment is intentionally non-live: PayPal is `sandbox`, Printify fulfillment is `disabled`, and OpenAI is not configured. These are safe test states, not launch states.
- Live Printify address quotes were exercised locally, but webhook installation was not attempted because no public HTTPS callback URL/secret was configured, and Printify draft/production submission remains intentionally disabled.
- The backend production dependency audit reports three moderate advisories through `sequelize-typescript → sequelize → uuid@8.3.2`. npm proposes a forced breaking Sequelize change, so it was not applied automatically. Track the Sequelize dependency, validate a compatible UUID override/upstream release in a branch, and rerun the complete database/commerce suite before accepting or remediating the risk.
- In-memory AI and credit-purchase rate limiting is process-local. A shared store or gateway limit is required for horizontal scaling.
- Customer legal/policy pages, production monitoring, backup/restore ownership, live-account reconciliation, and final hosted accessibility/performance checks remain owner-controlled launch requirements.

## Launch sequence

1. Freeze the release commit/image and record image digests.
2. Back up data and verify restore artifacts.
3. Deploy to staging with production-like HTTPS, origins, database settings, and private storage.
4. Run the complete automated suite and clean/existing schema checks.
5. Complete PayPal sandbox, Printify draft, and authorized OpenAI live checks.
6. Complete account, catalog, cart, order, review, credits, and responsive browser smoke tests.
7. Obtain owner approval for legal copy, credentials, budgets, operational alerts, and integration modes.
8. Deploy with Printify fulfillment disabled; verify health, catalog, sessions, and payment configuration.
9. Enable external production mutations only through separately approved change steps.
10. Monitor closely and keep the disable/rollback procedure ready.

## Explicit non-claims

- A PayPal sandbox order creation is not a real customer capture.
- A deterministic AI test provider is not proof of live OpenAI model/quota availability.
- Printify disabled-mode validation is not a provider draft or production order.
- Local browser smoke testing is not a substitute for testing the final HTTPS deployment.
- “Application verification complete” does not mean owner-controlled legal, operational, credential, and external-account tasks are complete.
