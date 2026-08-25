# NeoTokyo Elite Citizens Finder

A free, auto-updating website that shows which "Elite" NeoTokyo Citizens
(rarity rank < 500, per [neotokyo.codes](https://neotokyo.codes/citizens))
are currently listed for sale on [OpenSea](https://opensea.io/collection/neotokyo-citizens).

Replaces the manual process of pasting each OpenSea listing's token ID into
the neotokyo.codes rarity filter one at a time.

## How it works

- `scripts/fetch-data.mjs` drives a headless browser through the same
  rarity-filtered page + pagination you'd click through by hand, reading the
  rarity rank data straight off the page's own network responses. It then
  calls the official OpenSea API to get currently active listings, and
  writes the ones that match to `site/data.json`.
- `site/` is a static page that reads `data.json` and renders it.
- `.github/workflows/update.yml` runs the fetch script every hour on GitHub
  Actions, commits the refreshed data, and republishes the site to GitHub
  Pages. There's no server to run or pay for.

## One-time setup

1. **Before your first commit, protect your email.** Git embeds whatever
   email is in `user.email` into every commit, and that becomes publicly
   visible in the repo history forever, regardless of your GitHub profile
   privacy settings. On the pseudonymous account:
   - Settings -> Emails -> enable "Keep my email addresses private" and
     "Block command line pushes that expose my email".
   - Copy the generated `...@users.noreply.github.com` address.
   - Set it locally for *this repo only* (not your global git config):
     ```bash
     git config user.email "12345+yourusername@users.noreply.github.com"
     git config user.name "yourusername"
     ```

2. **Create the GitHub repo** (on your pseudonymous account) and push this
   folder to it:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```

3. **Get an OpenSea API key** on your own OpenSea account:
   OpenSea Settings -> Developer -> Get access -> fill in the short form ->
   Create key. (This has to be done by you directly, logged into your own
   account.)

4. **Add the key as a GitHub Actions secret**, so it's never committed to
   the code: repo Settings -> Secrets and variables -> Actions -> New
   repository secret -> name it `OPENSEA_API_KEY`, paste the key.

5. **Enable GitHub Pages**: repo Settings -> Pages -> Build and deployment
   -> Source: "GitHub Actions".

6. **Run the workflow once manually** to populate real data: repo's
   "Actions" tab -> "Update listings and deploy" -> "Run workflow". After
   that it runs automatically every hour (see the `cron` schedule in
   `.github/workflows/update.yml` — change `0 * * * *` to run more/less
   often).

Your site will then be live at `https://<your-username>.github.io/<repo-name>/`.

## Local development

```bash
npm install
npx playwright install --with-deps chromium
OPENSEA_API_KEY=your-key npm run fetch-data
```

Then open `site/index.html` with any static file server, e.g.:

```bash
npx serve site
```

## Notes

- Rarity threshold (`500`) and the collection slug live at the top of
  `scripts/fetch-data.mjs` if NeoTokyo's rarity model or the collection
  slug ever changes.
- Free-tier OpenSea API keys are rate-limited; the hourly schedule stays
  comfortably within that.
