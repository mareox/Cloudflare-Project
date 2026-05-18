"""Origin web server for the Cloudflare Application Services assignment.

Returns all HTTP request headers (plus the request method, path, query,
and body when present) in the response body.

Bind to 0.0.0.0:8080 inside the container; expose via Cloudflare Tunnel
ingress for tunnel.mareoxlan.com -> http://<container-ip>:8080.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from flask import Flask, Response, request

app = Flask(__name__)


@app.route("/", defaults={"path": ""}, methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
@app.route("/<path:path>", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
def echo(path: str) -> Response:
    payload = {
        "served_at": datetime.now(timezone.utc).isoformat(),
        "method": request.method,
        "path": "/" + path,
        "query": request.args.to_dict(flat=False),
        "remote_addr": request.headers.get("CF-Connecting-IP") or request.remote_addr,
        "headers": dict(request.headers.items()),
    }
    body = request.get_data(as_text=True)
    if body:
        payload["body"] = body

    return Response(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        mimetype="application/json",
    )


@app.route("/healthz")
def healthz() -> Response:
    return Response("ok\n", mimetype="text/plain")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
