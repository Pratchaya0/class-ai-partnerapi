import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Human-readable API reference. Open on purpose, same reason as /api/openapi.
 *
 * Renders the spec served by /api/openapi with Scalar, which also gives learners a
 * "Test Request" panel they can fire requests from.
 */
const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Partner Mock API - Reference</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1/dist/browser/standalone.min.js"></script>
    <script>
      Scalar.createApiReference('#app', {
        url: '/api/openapi',
        theme: 'purple',
      });
    </script>
  </body>
</html>
`;

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(PAGE);
}
