#!/usr/bin/env python3
"""Upload build artifacts to Google Drive through the Lovable connector gateway.

Usage: gdrive_upload.py <folder_id> [file ...]

Credentials come from two repo secrets that the workflow exports:
  LOVABLE_API_KEY      - gateway bearer token
  GOOGLE_DRIVE_API_KEY - connection key for the linked Google Drive account

Uses a Drive *resumable* upload session: the ~20 MB APK/AAB is sent in 8 MiB
chunks, which survives proxy/gateway connection drops that kill one-shot
multipart uploads ("EOF occurred in violation of protocol"). Each chunk and
the session start retry with backoff. Missing files are skipped; upload
failures are reported as GitHub warnings and never fail the build.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

GATEWAY = "https://connector-gateway.lovable.dev/google_drive"
RESUMABLE_URL = (
    GATEWAY + "/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true"
)
CHUNK_SIZE = 8 * 1024 * 1024  # 8 MiB, multiple of Drive's 256 KiB granularity
MAX_RETRIES = 4


def http(req: urllib.request.Request, timeout: int = 900) -> urllib.request.BaseHandler:
    return urllib.request.urlopen(req, timeout=timeout)


def retryable(exc: Exception) -> bool:
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code in (408, 429, 500, 502, 503, 504)
    return isinstance(exc, (urllib.error.URLError, TimeoutError, OSError))


def with_retries(fn, what: str):
    last = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return fn()
        except urllib.error.HTTPError as exc:
            detail = exc.read()[:300].decode("utf8", "replace")
            if not retryable(exc):
                raise RuntimeError("[%s] %s" % (exc.code, detail)) from exc
            last = RuntimeError("[%s] %s" % (exc.code, detail))
        except Exception as exc:  # noqa: BLE001
            last = exc
        time.sleep(min(2 ** attempt, 15))
    raise RuntimeError("%s after %d attempts: %s" % (what, MAX_RETRIES, last))


def start_session(headers: dict, name: str, folder_id: str, size: int) -> str:
    meta = {"name": name, "parents": [folder_id]}
    body = json.dumps(meta).encode()
    h = dict(headers)
    h["Content-Type"] = "application/json; charset=UTF-8"
    h["X-Upload-Content-Type"] = "application/octet-stream"
    h["X-Upload-Content-Length"] = str(size)

    def call():
        req = urllib.request.Request(RESUMABLE_URL, data=body, headers=h, method="POST")
        with http(req) as res:
            loc = res.headers.get("Location") or res.headers.get("location")
            if not loc:
                raise RuntimeError("no upload session URL returned")
            return loc

    return with_retries(call, "session start")


def put_chunk(session_url: str, payload: bytes, start: int, total: int, last: bool) -> dict:
    end = start + len(payload) - 1
    span = "*" if last else "%d-%d/%d" % (start, end, total)
    h = {
        "Content-Length": str(len(payload)),
        "Content-Range": "bytes %s" % span,
    }
    if last:
        h["Content-Range"] = "bytes %d-%d/%d" % (start, end, total)

    def call():
        req = urllib.request.Request(session_url, data=payload, headers=h, method="PUT")
        try:
            with http(req) as res:
                return json.loads(res.read() or b"{}")
        except urllib.error.HTTPError as exc:
            if exc.code == 308:  # accepted, keep going
                return {}
            raise

    return with_retries(call, "chunk %d-%d" % (start, end)) or {}


def multipart_upload(headers: dict, name: str, folder_id: str, payload: bytes) -> dict:
    """One-shot fallback for when the gateway does not hand back a session URL."""
    boundary = "===============jsrcoaching=="
    meta = json.dumps({"name": name, "parents": [folder_id]}).encode()
    body = b"".join([
        b"--", boundary.encode(), b"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n",
        meta, b"\r\n--", boundary.encode(),
        b"\r\nContent-Type: application/octet-stream\r\n\r\n",
        payload, b"\r\n--", boundary.encode(), b"--\r\n",
    ])
    h = dict(headers)
    h["Content-Type"] = 'multipart/related; boundary="%s"' % boundary
    url = GATEWAY + "/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true"

    def call():
        req = urllib.request.Request(url, data=body, headers=h, method="POST")
        with http(req) as res:
            return json.loads(res.read() or b"{}")

    return with_retries(call, "multipart upload") or {}


def main() -> int:
    lovable_key = os.environ.get("LOVABLE_API_KEY", "")
    drive_key = os.environ.get("GOOGLE_DRIVE_API_KEY", "")
    if not lovable_key or not drive_key:
        print("::warning::Drive upload skipped: gateway credentials not available.")
        return 0

    if len(sys.argv) < 2 or not sys.argv[1]:
        print("::warning::gdrive_upload.py: no folder id given")
        return 0

    folder_id = sys.argv[1]
    files = [f for f in sys.argv[2:] if f and os.path.isfile(f)]
    if not files:
        print("::warning::gdrive_upload.py: no build files found to upload")
        return 0

    headers = {
        "Authorization": "Bearer " + lovable_key,
        "X-Connection-Api-Key": drive_key,
    }

    for path in files:
        name = os.path.basename(path)
        with open(path, "rb") as handle:
            payload = handle.read()
        try:
            info = {}
            try:
                session_url = start_session(headers, name, folder_id, len(payload))
            except Exception as exc:  # noqa: BLE001
                print("::notice::Resumable session unavailable (%s) — using multipart upload." % exc)
                session_url = None
            if session_url:
                for start in range(0, len(payload), CHUNK_SIZE):
                    last = start + CHUNK_SIZE >= len(payload)
                    info = put_chunk(session_url, payload[start : start + CHUNK_SIZE], start, len(payload), last)
            else:
                info = multipart_upload(headers, name, folder_id, payload)
            print("Uploaded %s -> %s" % (path, (info or {}).get("id", "ok")))
        except Exception as exc:  # noqa: BLE001
            print("::warning::Drive upload failed for %s: %s" % (path, exc))
    return 0


if __name__ == "__main__":
    sys.exit(main())
