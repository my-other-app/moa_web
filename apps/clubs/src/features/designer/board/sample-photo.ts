/**
 * The sample guest's photo on a poster's stage: a drawn head and shoulders
 * on a warm backdrop, never a real person's face. A data: URI, so it draws
 * the way the server's pictures do and needs no request.
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F6C99B"/><stop offset="1" stop-color="#E58C6A"/></linearGradient>
<linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3D5A80"/><stop offset="1" stop-color="#293F5C"/></linearGradient>
</defs>
<rect width="600" height="600" fill="url(#bg)"/>
<circle cx="470" cy="120" r="70" fill="#FFFFFF" fill-opacity="0.18"/>
<path d="M90 600 C100 470 190 410 300 410 C410 410 500 470 510 600 Z" fill="url(#top)"/>
<rect x="262" y="330" width="76" height="96" rx="30" fill="#B9775A"/>
<ellipse cx="300" cy="250" rx="104" ry="122" fill="#C98763"/>
<path d="M196 238 C190 150 246 112 304 112 C372 112 414 160 404 238 C392 196 352 176 300 178 C252 180 212 196 196 238 Z" fill="#2B2321"/>
</svg>`;

// The markup is plain ASCII, so btoa takes it as it is.
const base64 = (s: string) => (typeof btoa === "function" ? btoa(s) : Buffer.from(s, "utf8").toString("base64"));

export const SAMPLE_GUEST_PHOTO = `data:image/svg+xml;base64,${base64(SVG)}`;
