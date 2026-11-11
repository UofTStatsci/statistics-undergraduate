# U of T Statistical Sciences — Graduate Programs

Static, template-free GitHub Pages site based on the Department of Statistical Sciences graduate brochure.

## Publish
1. Upload all files in this folder to the root of a GitHub repository.
2. In GitHub: Settings → Pages.
3. Choose **Deploy from a branch**, select `main` and `/ (root)`.
4. Save.

No build process is required.

## Alumni map data
`assets/data/alumni-locations.json` currently contains demonstration cities. Replace these with **aggregated/derived** coordinates from alumni locations.

Format:
```json
{"city":"New York","country":"USA","lat":40.7128,"lon":-74.0060,"count":12}
```

## External dependencies
The site loads D3 v7 and topojson-client from jsDelivr. Geographic land data is packaged locally.

## Notes
- Full-page behaviour uses native CSS scroll snap rather than fullPage.js.
- The cover collision canvas is adapted to standard browser JavaScript from the supplied D3/Observable concept and uses white particles.
- Replace the temporary text-based logo lockup with approved U of T / Statistical Sciences logo assets before production if desired.


## Previewing locally

Extract the entire ZIP before opening the site. The cover styling and collision animation are embedded directly in `index.html`, so the opening screen works even if external assets fail. For the interactive alumni map, preview through a small local web server (for example VS Code Live Server) because browsers may block local JSON requests when opening an HTML file directly. GitHub Pages serves these files normally.
