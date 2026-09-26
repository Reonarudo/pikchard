# No server component, ever

Pikchard is purely client-side: rendering is WASM in the page, Documents live on the user's disk (or in the browser's storage), and sharing is a compressed Script in the URL fragment. mermalaid runs serverless functions for public share-link preview images, OG rendering and Slack; we deliberately do not, so the web build is plain static files hostable anywhere and there are no accounts, no gallery and no operational surface.

## Consequences

- Share links carry the whole Script; there is no link-preview image and no short-URL service.
- Any future feature that needs a server is out of scope by default and needs a new decision, not a quiet exception.
- No analytics or telemetry and no third-party scripts either; the web build ships with a strict Content Security Policy.
