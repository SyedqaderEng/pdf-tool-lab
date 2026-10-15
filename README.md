# ZapToolsCanvas

An all-in-one landing page and private browser-based workspace for PDF files, images, developer workflows, text, tabular data, and SaaS projections. The React page follows the preserved design in `src/index-backup.html`, including its Poppins and Space Mono fonts, navy/blue/emerald palette, and landing-page section order.

## Run locally

Requirements: Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Create the production bundle with `npm run build`; run the business-logic tests with `npm test`. The app is a static Vite build and can be hosted behind any HTTPS-capable static web server. HTTPS is needed for browser Web Crypto APIs outside localhost.

## Processing and limits

All file and text processing runs in the browser. PDF merge and split preserve copied page content; PDF optimization rewrites PDF object streams and may not reduce every file. Image conversion uses the browser canvas, and Color key removes pixels close to a selected flat color. This is not AI subject segmentation. JWT decoding inspects claims but does not verify a token signature. Browser PDF encryption, OCR, AI background removal, and remote storage are not included. PDF workflows limit files to 100 MB each, merge inputs to 250 MB combined, and splitting to 500 pages; image workflows limit files to 50 MB and output dimensions to 40 megapixels.