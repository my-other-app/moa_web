"""Writes the backend's OpenAPI document, built from its source.

Run from the backend's `backend/` folder (the one holding doth.py), with the
backend's requirements and dev requirements installed:

    python /path/to/dump-backend-openapi.py /path/to/openapi.json

It borrows the backend test suite's settings (tests/conftest.py fills in
made-up values for every required setting), so it needs no database, no
secrets and no network. CI uses it for the OpenAPI drift check, and it is how
packages/api/openapi.json is refreshed.
"""

import json
import os
import sys

if len(sys.argv) != 2:
    sys.exit("usage: python dump-backend-openapi.py <output.json>")
if not os.path.isfile("doth.py"):
    sys.exit("run this from the backend's backend/ folder (where doth.py is)")

sys.path.insert(0, ".")
os.environ["APP_API_DOCS"] = "true"

import tests.conftest  # noqa: E402,F401  (the suite's settings, set before any app import)
from doth import application as app  # noqa: E402

doc = app.openapi()
with open(sys.argv[1], "w", encoding="utf-8") as out:
    json.dump(doc, out, indent=2, sort_keys=True)
    out.write("\n")
print(f"Wrote {sys.argv[1]}: {len(doc.get('paths', {}))} paths")
