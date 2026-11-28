# CSC & BC Apna Hisaab — Cloudflare Worker + D1 Fleet Monitor

100% Free Serverless Collector to see:
- Total unique PCs running your software (`HWID`)
- Which Shop Name / PC is on which Version (`v1.0.98`, etc.) and Port (`4000`/`4001`)
- Live Online / Offline status (`last_seen_at`)
- Real-time Browser, Server, Updater & Installer Error Logs

## Quick 1-Click Deploy (Windows)
1. Create a free Cloudflare account at `https://dash.cloudflare.com/sign-up`.
2. Double-click `SETUP_CLOUDFLARE.bat` inside this folder.
3. Approve the browser login prompt.
4. Copy the deployed Worker URL (`https://cmbc-fleet-monitor.<your-name>.workers.dev`), `INGEST_TOKEN`, and `ADMIN_KEY`.
5. Open your App → **Settings → All PCs Monitor** → paste URL & keys → **Save & Test**.

## Security Design
- **Write-only `INGEST_TOKEN`**: Placed in `config/telemetry.json` (can only submit heartbeats/errors, cannot read any device or error data).
- **Master `ADMIN_KEY`**: Kept ONLY on Sanjay Ji's Admin PC / mobile browser (`X-Admin-Key`), never shipped to customer PCs.
- **Zero Financial / Customer Data Sent**: Only `HWID`, Shop Name, Hostname, App Version, Port, and redacted technical error messages are sent.
