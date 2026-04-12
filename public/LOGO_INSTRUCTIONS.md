# Logo Setup

The current logo is `logo.svg` (a placeholder). To replace it with your actual logo:

1. Add your logo file to this `public/` directory as `logo.svg` (SVG recommended) **or** `logo.png`.
2. If using PNG, update the three `src="/logo.svg"` references in `components/Login.tsx` and `App.tsx` to `src="/logo.png"`.

The logo is displayed in:
- The login page (left brand panel and mobile header)
- The top-left corner of the dashboard sidebar on all app pages

**Recommended specifications:**
- Format: SVG (scales perfectly) or PNG with transparent background
- Aspect ratio: roughly square works best
- The image renders at 36×36 px (sidebar) and 40–44 px (login page)
