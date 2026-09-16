#!/usr/bin/env python3
"""Upload build artifacts to Google Drive through the Lovable connector gateway.

Usage: gdrive_upload.py <folder_id> [file ...]

Credentials come from two repo secrets that the workflow exports:
  LOVABLE_API_KEY      - gateway bearer token
  GOOGLE_DRIVE_API_KEY - connection key for the linked Google Drive account

No service-account JSON is needed. Missing files are skipped; upload failures
are reported as GitHub warnings and never fail the build.
"""
import json
import os
import sys
import urllib.request

GATEWAY = "https://connector-gateway.lovable.dev/google_drive"
UPLOAD_URL = (
    GATEWAY + "/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true"
)
BOUNDARY = "jsrcoachingbuildupload"


def multipart_body(metadata: dict, name: str, payload: bytes) -> bytes:
    dash = ("--" + BOUNDARY).encode()
    parts = [
        dash,
        b'Content-Disposition: form-data; name="metadata"',
        b"Content-Type: application/json; charset=UTF-8",
        b"",
        json.dumps(metadata).encode(),
        dash,
        ('Content-Disposition: form-data; name="file"; filename="%s"' % name).encode(),
        b"Content-Type: application/octet-stream",
        b"",
        payload,
        ("--" + BOUNDARY + "--").encode(),
        b"",
    ]
    return b"\r\n".join(parts)


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
        "Content-Type": "multipart/related; boundary=" + BOUNDARY,
    }

    for path in files:
        name = os.path.basename(path)
        with open(path, "rb") as handle:
            payload = handle.read()
        body = multipart_body({"name": name, "parents": [folder_id]}, name, payload)
        req = urllib.request.Request(UPLOAD_URL, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=900) as res:
                info = json.loads(res.read() or b"{}")
            print("Uploaded %s -> %s" % (path, info.get("id")))
        except urllib.error.HTTPError as exc:  # noqa: PERF203
            detail = exc.read()[:500].decode("utf8", "replace")
            print("::warning::Drive upload failed for %s [%s]: %s" % (path, exc.code, detail))
        except Exception as exc:  # noqa: BLE001
            print("::warning::Drive upload failed for %s: %s" % (path, exc))
    return 0


if __name__ == "__main__":
    sys.exit(main())
