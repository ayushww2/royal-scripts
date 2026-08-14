const http = require("http");

const PORT = process.env.PORT || 3000;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Royal Scripts Maker</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: Georgia, "Times New Roman", serif;
      background: radial-gradient(circle at top, #2a1a08 0%, #0b0b0b 55%);
      color: #f4e6c3;
    }
    main {
      text-align: center;
      padding: 2rem;
    }
    h1 {
      margin: 0 0 0.75rem;
      letter-spacing: 0.08em;
      font-weight: 600;
    }
    p {
      margin: 0;
      color: #cbb98a;
    }
  </style>
</head>
<body>
  <main>
    <h1>Royal Scripts Maker</h1>
    <p>The project is live. More coming soon.</p>
  </main>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "royal-scripts-maker" }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Royal Scripts Maker listening on port ${PORT}`);
});
