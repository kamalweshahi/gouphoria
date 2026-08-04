# Store frontend

React 19 + TypeScript + Vite customer and administration interface for Store.

The frontend contains no provider or database secrets. It calls the API configured by `VITE_REST_SERVER_URL`, sends the HttpOnly session cookie with requests, and loads PayPal through the existing backend-provided public client ID.

Use the repository [README](../README.md) for setup, operating modes, testing, security, database, and launch instructions. Production builds are verified in Docker so no local `dist` directory is required.

Available commands:

```sh
npm run dev
npm run lint
npm run build
```

For Compose, `.env.compose` points the built browser bundle at the exposed API URL.

