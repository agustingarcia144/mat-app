# PWA Icons

Place your app icons in this folder. Next.js serves files from `public/`, so these paths are available at `/icons/...`.

## Required icon sizes

| Filename                    | Size    | Purpose                              |
| --------------------------- | ------- | ------------------------------------ |
| `icon-72x72.png`            | 72×72   | General use                          |
| `icon-96x96.png`            | 96×96   | General use                          |
| `icon-128x128.png`          | 128×128 | General use                          |
| `icon-144x144.png`          | 144×144 | General use                          |
| `icon-152x152.png`          | 152×152 | General use (e.g. iPad)              |
| `icon-192x192.png`          | 192×192 | General use (Android home screen)    |
| `icon-384x384.png`          | 384×384 | General use                          |
| `icon-512x512.png`          | 512×512 | General use (splash / high-DPI)      |
| `icon-maskable-192x192.png` | 192×192 | **Maskable** (Android adaptive icon) |
| `icon-maskable-512x512.png` | 512×512 | **Maskable** (splash / adaptive)     |

## Maskable icons

Maskable icons are used for Android adaptive icons. They should have **safe padding**: keep important content within roughly the center 80% of the image so it isn’t cropped by system shapes (circle, squircle, etc.).

- **Any**: can be scaled/cropped by the OS.
- **Maskable**: same sizes but designed with safe zone; referenced in `manifest.json` with `"purpose": "maskable"`.

## Optional: Apple Touch Icon

For iOS home screen you can also add to `public/`:

- `apple-touch-icon.png` — **180×180** (recommended)

Then add to your root layout `<head>`:

```html
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

Or use Next.js metadata: `icons: { apple: '/apple-touch-icon.png' }`.
