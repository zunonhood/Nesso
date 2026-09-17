# Nesso

Nesso is a working rescue-assessment MVP for public open-source repositories.

## What works

- Reads live public repository, commit, contributor, issue and release data from GitHub.
- Produces a transparent health score and a prioritized rescue plan.
- Persists the latest 100 rescue dossiers in .data/rescues.json.
- Connects an EVM wallet and switches to Robinhood Chain mainnet (chain ID 4663).
- Optionally publishes a dossier fingerprint in a user-signed, zero-value transaction and stores the transaction hash.

## Run

Run npm start, then open http://127.0.0.1:4173/.

GitHub allows limited unauthenticated public API access. For sustained use, set GITHUB_TOKEN on the server before starting Nesso. Never expose that token in app.js or commit it.

## API

- GET /api/health
- GET /api/rescues
- POST /api/assess with a repositoryUrl field
- POST /api/rescues/:id/proof with a transaction hash and wallet address

## Honest scope

Repository assessment and chain-proof publishing are live. Treasury contracts, bounty claiming, automated patch verification, and settlement are still illustrative future phases.

## Update launch links

Set APP.contractAddress at the top of app.js when the Robinhood Chain contract is live. The X profile is configured in index.html as https://x.com/nessocollect.


## GitHub Pages

The public build uses live GitHub public API data and browser localStorage, so repository assessment works without the Node server. Wallet connection and Robinhood Chain proof transactions remain client-side.

Custom domain: https://nesso.fun

