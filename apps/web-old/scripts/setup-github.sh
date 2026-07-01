#!/usr/bin/env bash
# One-time setup: create GitHub OAuth App and GitHub App for Folio Web.
#
# Step 1: Create a GitHub OAuth App
#   Go to: https://github.com/settings/developers
#   Click "New OAuth App"
#     Application name: Folio Web (dev)
#     Homepage URL: http://localhost:8788
#     Authorization callback URL: http://localhost:8788/auth/callback
#   Click "Register application"
#   Copy the Client ID and generate a Client Secret.
#
# Step 2: Create a GitHub App
#   Go to: https://github.com/settings/apps
#   Click "New GitHub App"
#     GitHub App name: folio-web-dev
#     Homepage URL: http://localhost:8788
#     Callback URL: http://localhost:8788/auth/callback
#     Expire user authorization tokens: Yes
#     Request user authorization (OAuth) during installation: Yes
#     Permissions:
#       Pull requests: Read & write
#       Contents: Read & write (for merge and branch delete)
#       Metadata: Read-only
#     Where can this GitHub App be installed?: Any account
#   Click "Create GitHub App"
#   Generate a private key (download .pem)
#   Note the App ID
#
# Step 3: Set Cloudflare secrets
#   cd apps/web
#   echo "$CLIENT_ID" | npx wrangler secret put GITHUB_CLIENT_ID
#   echo "$CLIENT_SECRET" | npx wrangler secret put GITHUB_CLIENT_SECRET
#   echo "$APP_ID" | npx wrangler secret put GITHUB_APP_ID
#   cat folio-web-dev.pem | npx wrangler secret put GITHUB_APP_PRIVATE_KEY
#
# Step 4: Deploy
#   bun run deploy

echo "See scripts/setup-github.sh for manual setup instructions."
echo ""
echo "After creating your OAuth App and GitHub App, set secrets:"
echo "  npx wrangler secret put GITHUB_CLIENT_ID"
echo "  npx wrangler secret put GITHUB_CLIENT_SECRET"
echo "  npx wrangler secret put GITHUB_APP_ID"
echo "  npx wrangler secret put GITHUB_APP_PRIVATE_KEY"
