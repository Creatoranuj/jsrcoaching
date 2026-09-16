#!/usr/bin/env python3
"""Upload build artifacts to a Google Drive folder using a service account.

Usage: gdrive_upload.py <folder_id> [file ...]

Credentials are read from /tmp/gdrive-sa.json (written by the workflow from the
GDRIVE_SERVICE_ACCOUNT_JSON secret). Missing files are skipped; upload failures
are reported as GitHub warnings and never fail the build.
"""
import json
import os
import sys

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

SA_PATH = "/tmp/gdrive-sa.json"
UPLOAD_URL = (
    "https://www.googleapis.com/upload/drive/v3/files"
    "?uploadType=multipart&supportsAllDrives=true"
)


def main() -> int:
    if len(sys.argv) < 2:
        print("::warning::gdrive_upload.py: no folder id given")
        return 0

    folder_id = sys.argv[1]
    files = [f for f in sys.argv[2:] if f and os.path.isfile(f)]
    if not files:
        print("::warning::gdrive_upload.py: no build files found to upload")
        return 0

    creds = service_account.Credentials.from_service_account_file(
        SA_PATH, scopes=["https://www.googleapis.com/auth/drive.file"]
    )
    creds.refresh(Request())
    headers = {"Authorization": "Bearer %s" % creds.token}

    for path in files:
        name = os.path.basename(path)
        metadata = {"name": name, "parents": [folder_id]}
        with open(path, "rb") as handle:
            response = requests.post(
                UPLOAD_URL,
                headers=headers,
                files={
                    "metadata": ("metadata", json.dumps(metadata), "application/json"),
                    "file": (name, handle, "application/octet-stream"),
                },
                timeout=900,
            )
        if response.status_code >= 300:
            print(
                "::warning::Drive upload failed for %s [%s]: %s"
                % (path, response.status_code, response.text[:500])
            )
        else:
            print("Uploaded %s -> %s" % (path, response.json().get("id")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
