# The Boys Collection Tracker (Starter Kit)

This is a tiny, static web app that turns your Excel-based checklist into a searchable online dashboard.

## What you get

- A read-only checklist with search + filters
- Quick stats (owned / incoming / missing / completion / points)
- A detail pop-up for each card (with an image slot)

## Quick start (local)

1. Unzip this folder
2. Open `site/index.html` in your browser

> Some browsers block `fetch()` from local files.
> If you see a “Failed to load data/cards.json” message, run a tiny local server:
>
> - Python: `python -m http.server 8000` inside the `site/` folder
> - Then open: `http://localhost:8000`

## Updating from Excel

Put your latest spreadsheet file at the repo root (or adjust the path in the script), then run:

```bash
python scripts/export_from_excel.py
```

That regenerates `site/data/cards.json`.

## Adding images

Drop images into `site/images/` named by the card `id` shown in the detail view:

```
site/images/abc123def456.jpg
```

When the image exists, it will appear in the pop-up.

## Deploying (GitHub Pages)

1. Create a GitHub repo and upload this folder
2. Enable **GitHub Pages** in repo settings
3. Choose the `site/` folder as the publishing source (if using a Pages workflow), or move `site/*` to the repo root

### Privacy warning

GitHub Pages sites are public on the internet. If you don’t want your ownership status visible, create a “public export” that strips `owned/incoming/missing` before publishing.
