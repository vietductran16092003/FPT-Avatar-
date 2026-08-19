"""Local static server that always declares charset=utf-8 on text
responses. Needed because Python's default http.server sends
"Content-Type: text/html" with no charset, which can make some
browsers guess the wrong encoding for the Vietnamese text pulled in
from shared.js. Real hosting (Netlify/Vercel/GitHub Pages) sets this
correctly by default, so this file only matters for local preview.
"""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8090

TEXT_TYPES = {
    ".html": "text/html",
    ".htm": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
}


class UTF8Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def guess_type(self, path):
        for ext, mime in TEXT_TYPES.items():
            if path.endswith(ext):
                return f"{mime}; charset=utf-8"
        return super().guess_type(path)


if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), UTF8Handler) as httpd:
        print(f"Serving with explicit UTF-8 charset on http://localhost:{PORT}")
        httpd.serve_forever()
