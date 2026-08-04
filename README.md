# Store

Store is a full-stack, phone-case-only commerce application. Customers can browse real Printify phone-case variants, create private artwork with OpenAI image generation, purchase standard or customized cases with PayPal, and follow payment, review, fulfillment, and credit history from an authenticated account.

The temporary customer-facing brand is **Store**. Printify, PayPal, and OpenAI are connected services—not the storefront brand.

## What is implemented

- Phone-case-only Printify catalog synchronization with normalized phone models and case types.
- Backend-controlled variant availability and pricing; browser-submitted prices are ignored.
- Name/email/password accounts with bcrypt password hashes, opaque sessions, hashed session tokens, HttpOnly cookies, user/admin roles, and automatic free AI credits.
- Persistent user carts, immutable order snapshots, order items, addresses, payments, and order history.
- Backend-only Printify shipping quotes bound to the authenticated user, address, cart or direct variant, quantity, currency, and expiry.
- Existing PayPal order creation/capture for standard products, mixed carts, and paid AI-credit packages.
- Standard Printify fulfillment with explicit `disabled`, `draft`, and `production` safety modes.
- Private AI projects, validated reference uploads, moderation, generation, one revision, deterministic preview mockups, ownership checks, and owner-only assets.
- Paid AI-design commerce with frozen artwork snapshots, admin review, customer-visible decisions, audit history, and post-approval Printify fulfillment.
- Free and paid credit ledger, idempotent credit purchase capture, admin adjustments, and an optional delivered-order reward.
- Admin customer, order, and storefront-product management with pagination, safe operational detail, notes, audits, independent direct/AI product rules, and per-variant storefront controls.
- Session restoration before protected routing plus secret-free multi-tab login, logout, and account-change synchronization.
- Responsive storefront and protected account/admin pages with accessible states, route metadata, lazy-loaded pages, and production caching.

## Architecture

```text
Browser (React/Vite)
  ├─ authenticated API requests + HttpOnly session cookie
  ├─ PayPal browser SDK
  └─ private image requests (owner/admin authorized)
           │
Express/TypeScript API
  ├─ Sequelize models + additive migrations ── MySQL 8
  ├─ existing PayPal service ───────────────── PayPal
  ├─ extended Printify service ─────────────── Printify
  └─ AI provider + private storage ─────────── OpenAI / protected volume
```

The browser never receives database, Printify, PayPal-secret, or OpenAI credentials. Public provider identifiers needed by client SDKs are returned through narrow backend endpoints.

## Requirements

- Docker Desktop with Compose (recommended), or Node.js 24 and MySQL 8.
- A Printify shop containing supported phone-case products.
- PayPal sandbox credentials for non-live checkout testing.
- An OpenAI API key only when real AI generation is intentionally enabled.

## Local setup with Docker Compose

1. Copy the placeholder configuration and enter your own credentials:

   ```sh
   cp backend/.env.example backend/.env
   ```

2. Keep fulfillment disabled for initial verification:

   ```dotenv
   PRINTIFY_FULFILLMENT_MODE=disabled
   PAYPAL_ENV=sandbox
   ```

3. Build and start the stack:

   ```sh
   docker compose up --build -d
   ```

4. Open `http://localhost:6124`. The API is at `http://localhost:3010`, and `GET /health` reports API availability.

Compose stores MySQL data and private AI files in named volumes. Ordinary rebuilds do not remove them. Do not run `docker compose down -v` against data you intend to retain.

## Environment variables

Use [backend/.env.example](backend/.env.example) as the canonical, credential-free template. Specialized examples document related subsets.

| Area | Required for feature | Important settings |
| --- | --- | --- |
| Printify catalog | Yes | `PRINTIFY_API_KEY`, `PRINTIFY_SHOP_ID` |
| PayPal checkout | Yes | `PAYPAL_ENV`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` |
| Database | Yes for accounts/commerce | `DB_ENABLED`, `DB_REQUIRED`, `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` |
| Browser access | Production | `CORS_ORIGINS`, `AUTH_SESSION_DAYS`, `AUTH_BCRYPT_ROUNDS`, `AUTH_COOKIE_DOMAIN`, `TRUST_PROXY`, `REQUEST_JSON_LIMIT` |
| AI generation | Only for live AI | `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`, `AI_STORAGE_ROOT` |
| Shipping and fulfillment | Quotes are required for checkout; submission is opt-in | `PRINTIFY_SHIPPING_QUOTE_MINUTES`, `PRINTIFY_FULFILLMENT_MODE`, `PRINTIFY_AI_PRINT_ON_SIDE` |
| Printify webhooks | Recommended for order tracking | `PRINTIFY_WEBHOOK_BASE_URL`, `PRINTIFY_WEBHOOK_SECRET` |
| Credit controls | Optional tuning | purchase rate limits and delivered-order reward |

Never put secret values in frontend environment files or commit `backend/.env`. Credentials are not rotated or changed by the application.

### Integration modes

- **Local deterministic tests:** tests stub external mutations where needed and verify the application logic/database safely.
- **PayPal sandbox:** creates real sandbox provider orders. A successful creation is not the same as a payer-approved capture.
- **Printify `disabled`:** validates and records fulfillment readiness without creating a Printify order.
- **Printify `draft`:** creates a provider draft but does not send it to production. This is an external write and can require cleanup in Printify.
- **Printify `production`:** creates and sends an order to production. Enable only after commercial, shipping, and print-area validation.
- **OpenAI live:** consumes real API quota and creates generated assets. Without `OPENAI_API_KEY`, the feature fails safely with a configuration message while projects/uploads remain saved.

### Printify token scopes

The connected token should grant `catalog.read`, `orders.read`, `orders.write`, `print_providers.read`, `products.read`, `products.write`, `shops.read`, `uploads.read`, `uploads.write`, `webhooks.read`, and `webhooks.write`. Catalog/product/provider/shop scopes support validated phone-case mapping; uploads scopes support final artwork reuse; order scopes support current shipping quotes, submission, and reconciliation; webhook scopes support idempotent status synchronization. Keep the token backend-only.

## Database lifecycle

At startup, Sequelize can create missing tables with `sync()` when `DB_SYNC=true`. It never uses destructive `force` or automatic `alter`. Additive migrations are tracked in `schema_migrations` and execute once in order:

1. Catalog metadata
2. Cart, orders, and payments
3. Standard fulfillment
4. AI design workflow
5. AI design commerce and admin audit
6. Paid AI credits
7. Authoritative pricing, dynamic shipping quotes, saved shipping selections, legacy fee removal, and Printify webhook idempotency
8. Storefront catalog controls, per-variant eligibility, and admin customer/order notes
9. Exact preservation of products already referenced by saved AI designs
10. Realistic mockup template metadata and safe preview backfill
11. Exact template-family mapping for the currently AI-enabled PU leather case
12. Versioned smooth studio mockup with safe legacy-preview regeneration
13. Full-bleed studio back-shell geometry with safe legacy-preview regeneration
14. Customer-supplied reference-photo mockup with safe legacy-preview regeneration
15. Exact phone-model camera registry with versioned preview regeneration
16. Clean source-camera removal with final model-camera preview regeneration
17. Device-aware printable masks, proportional full-bleed placement, safe areas, and surface integration
18. Premium artwork-aware shell rim, product depth, and studio-shadow regeneration

AI designs keep the printable artwork and derived product preview as separate private assets. Printify fulfillment always uploads the verified artwork snapshot, never the mockup. The backend’s layered Sharp templates and extension contract are documented in [docs/MOCKUP_TEMPLATES.md](docs/MOCKUP_TEMPLATES.md).

AI image requests are augmented server-side with hidden phone-case composition rules. The provider returns flat 1024×1536 artwork with edge-to-edge bleed, a central focal safe area, camera/edge breathing room, and no product mockup or built-in frame. Before an output is stored or charged, the backend verifies its resolution, 2:3 aspect ratio, readability, and absence of an obvious visible border. Customer prompts remain customer-facing text; these production instructions are not saved as the prompt shown in project history.

For production, back up MySQL first, set `DB_REQUIRED=true`, and run the same application image against a staging copy before rollout. Do not remove migration history rows.

To run schema synchronization in the backend container:

```sh
docker compose exec -T backend node dist/database/sync.js
```

## Administration

New registrations always receive the `user` role. Promote a known account deliberately in MySQL; never expose role choice during registration:

```sql
UPDATE users SET role = 'admin' WHERE email = 'owner@example.com';
```

Admin capabilities include customer search/detail/status/notes, complete order operations and audit visibility, independent storefront/direct/AI product configuration, per-variant controls, catalog synchronization, the paid AI review queue, exact artwork/reference inspection, confirmed approve/reject/change decisions, safe fulfillment retry/sync, dashboard counts, and immutable credit adjustments. Verify the target email and use a unique admin password before promotion.

AI customization is opt-in. A product with `allowAiCustomization=true` can appear in Create with AI; an AI-custom-only product also has `allowDirectPurchase=false` and `aiCustomOnly=true`, so its base variant cannot enter a cart without a finalized owned design. Hidden, inactive, unmapped, unavailable, or storefront-disabled products and variants are rejected by the backend.

## Development and verification

The project deliberately ignores local `dist` output. The production build can be verified entirely inside Docker images:

```sh
docker compose build backend frontend
docker build --target builder -t case-store-frontend-builder ./frontend
docker run --rm case-store-frontend-builder npm run lint
```

With the Compose services running, execute the backend suites in the backend container:

```sh
docker compose exec -T backend npm test
```

Individual suites are available as `test:auth`, `test:catalog`, `test:commerce`, `test:fulfillment`, `test:ai`, `test:ai-commerce`, `test:credits`, and `test:release`. The complete command also runs authoritative pricing, shipping quote, and webhook tests.

Integration tests create uniquely named synthetic records and clean them up. Run tests against a non-production database. Catalog and PayPal regression tests can contact configured sandbox/provider accounts; review the active environment before running them.

Browser tabs on the same origin share the same HttpOnly authentication cookie. Login, logout, and account changes are synchronized across tabs without storing session secrets in browser storage. To test two different accounts at the same time, use separate browser profiles or one normal and one incognito/private browser session.

## Main API groups

- `/auth` — registration, login/logout, current user, profile, self/admin user lookup.
- `/products` — phone-case catalog/details, authenticated AI-eligible catalog, and admin catalog synchronization.
- `/cart` — persistent cart items, quantities, AI-design cart entries, and clearing.
- `/orders` — backend-quoted Printify shipping options, current user order creation/history/details, and protected fulfillment operations.
- `/payments` — existing PayPal client ID, order creation, and capture.
- `/ai` — private designs, uploads/assets, generation, revision, and approval.
- `/credits` — packages, ledger/history, and PayPal credit purchases.
- `/admin` — dashboard; customer, order, and product management; AI review; fulfillment retry/sync; Printify webhook synchronization; and credit adjustments.
- `/webhooks/printify` — raw-body, HMAC-verified, idempotent Printify order status callbacks.

All ownership-sensitive routes require authentication and enforce owner/admin scope on the server. Frontend protected routes improve navigation but are not the security boundary.

## Production checklist

Before launch, complete every owner-controlled task in [docs/RELEASE_READINESS.md](docs/RELEASE_READINESS.md). At minimum:

- Back up and test-restore MySQL and the private AI storage volume.
- Replace development database passwords and verify `backend/.env` permissions.
- Rotate any credential that may ever have been exposed; the application will not do this automatically.
- Set the exact HTTPS storefront origin in `CORS_ORIGINS` and terminate TLS at a trusted proxy/load balancer.
- Use PayPal sandbox through payer approval/capture before switching to live credentials.
- Validate live address quotes, blueprint/provider print areas, each selectable shipping method, manual order approval, and a real draft before considering production fulfillment.
- Install the required Printify webhooks through the admin-only sync endpoint after configuring a public HTTPS callback URL and a strong webhook secret.
- Confirm OpenAI model access, moderation behavior, quota/budget alerts, privacy/retention terms, and failure handling.
- Set monitoring/alerting for API errors, failed captures, failed fulfillment, stuck review items, storage growth, and expiring operational credentials.
- Publish customer-facing shipping, returns/refunds, privacy, terms, and AI-content policies appropriate to the launch jurisdiction.

## Troubleshooting

- **Catalog is empty:** verify the Printify key/shop and ensure the connected shop has enabled, supported phone-case variants; then use the admin sync.
- **Cookies do not persist:** verify frontend/API origin settings, HTTPS in production, proxy trust, and `CORS_ORIGINS`.
- **PayPal buttons fail:** confirm sandbox/live credentials match `PAYPAL_ENV` and inspect the safe API event reference rather than exposing provider payloads.
- **Shipping is unavailable:** confirm the exact variant is enabled, the destination fields are complete, and the Printify token can calculate shipping for the connected shop.
- **Webhook sync fails:** use a public HTTPS `PRINTIFY_WEBHOOK_BASE_URL`, a secret of at least 20 characters, and a token with `webhooks.read` and `webhooks.write`.
- **AI generation unavailable:** set a valid backend-only OpenAI key and supported image model. Saved projects/uploads remain available after a provider failure.
- **Fulfillment remains ready/blocked:** check the configured safety mode. AI items intentionally wait for admin approval; standard items do not use the AI review queue.
- **Database startup fails:** verify MySQL health, credentials, grants, migration history, and that the target database was backed up before changes.

## Data and security notes

- Password hashes and session token hashes are never serialized to clients.
- Session cookies are HttpOnly, SameSite=Lax, and Secure in production.
- Uploads are size/type/signature/dimension checked and stored outside public frontend assets with restrictive filesystem modes.
- Order line prices, provider IDs, and approved artwork checksums are snapshotted for auditability.
- Order totals use integer cents and contain only retail item subtotal, the selected Printify shipping amount, and any actual tax amount (currently zero unless a connected flow supplies one).
- Shipping quotes expire and are bound to the authenticated user, exact address, exact items/variants, quantities, and currency; PayPal creation and capture revalidate the saved selection.
- Printify webhook signatures are verified against the unparsed request body, and event IDs are stored to make retries idempotent.
- Provider errors are logged as safe codes/statuses and returned as friendly messages with event IDs; request bodies, authorization headers, and raw provider responses are not logged.
- In-memory rate limits are appropriate for a single API instance. Use a shared rate-limit store or gateway controls before horizontally scaling.
