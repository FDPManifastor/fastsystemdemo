<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/6f723b3a-e31b-4e6d-8295-e9a739eb650b

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Secure Deployment

Configure these environment variables in the hosting service. Never commit the admin password or put it in frontend code.

- `ADMIN_PASSWORD`: generate a unique secret with `openssl rand -base64 32` and store it as a Render secret.
- `PUBLIC_APP_ORIGIN`: the exact public origin, for example `https://your-service.onrender.com`.
- `NODE_ENV`: `production`.

For Render, use `npm ci && npm run build` as the build command and `npm start` as the start command. Render provides `PORT` automatically.

The admin session is held in server memory, so use one server instance; restarts require staff to log in again. Orders are stored in `orders.json`. Attach persistent storage at the server's working directory and maintain backups before using this for production orders, since an ephemeral filesystem can lose order data on redeploy. Customer tracking links contain bearer tokens: share them only with the intended customer.
