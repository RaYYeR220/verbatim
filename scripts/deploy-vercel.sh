#!/bin/sh
# Builds for Vercel and deploys the prebuilt output to production.
# Nitro writes some function directories as symlinks to the shared server
# function; they are copied so every function uploads on any OS.
set -e
pnpm migrate:production
NITRO_PRESET=vercel pnpm build
cd .vercel/output/functions
find . -type l | while read -r link; do
  rm "$link"
  cp -r __server.func "$link"
done
cd - >/dev/null
npx vercel deploy --prebuilt --prod "$@"
