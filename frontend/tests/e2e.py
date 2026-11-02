"""Frontend end-to-end test (Playwright, Chromium).

Visits all 12 pages against a running backend (default http://127.0.0.1:8000),
fails on uncaught page errors / failed API calls, exercises the main flows and
saves screenshots to frontend/tests/screenshots/.

    python frontend/tests/e2e.py [base_url]
"""
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
OUT = Path(__file__).parent / "screenshots"
OUT.mkdir(exist_ok=True)
PAGES = ["/", "/dashboard", "/register", "/diagnosis", "/agents", "/simulation", "/scenarios", "/knowledge-graph",
         "/rag", "/cases", "/reports", "/about"]


def main():
    errors, results = [], {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("response", lambda r: errors.append(f"HTTP {r.status} {r.url}") if "/api/" in r.url and r.status >= 500 else None)
        for path in PAGES:
            page.goto(f"{BASE}/#{path}")
            page.wait_for_load_state("networkidle")
            time.sleep(1.2)
            page.screenshot(path=str(OUT / f"{path.strip('/').replace('/', '_') or 'home'}.png"), full_page=True)
            results[path] = page.locator("h1").first.inner_text()

        # flow 1: register patient -> diagnosis with a test image -> agents
        page.goto(f"{BASE}/#/register"); page.wait_for_load_state("networkidle")
        page.get_by_role("button", name="Blackheads or whiteheads").click()
        page.get_by_role("button", name="Oily / greasy skin").click()
        page.get_by_role("button", name="Register patient").click()
        page.get_by_text("Continue to AI diagnosis").click()
        page.wait_for_load_state("networkidle"); time.sleep(0.8)
        page.locator("button[title^='Acne']").first.click()
        page.get_by_role("button", name="Run 5-agent workflow").click()
        page.get_by_text("Workflow route").wait_for(timeout=60000)
        time.sleep(1.0)
        page.screenshot(path=str(OUT / "flow_diagnosis_result.png"), full_page=True)
        results["flow_diagnosis"] = "ok"

        # flow 2: clinic simulation start -> finish
        page.goto(f"{BASE}/#/simulation"); page.wait_for_load_state("networkidle")
        page.get_by_role("button", name="Start").click()
        page.get_by_text("Avg waiting time").wait_for(timeout=30000)
        time.sleep(3)
        page.screenshot(path=str(OUT / "flow_simulation_running.png"), full_page=True)
        if page.get_by_role("button", name="Pause").is_enabled():
            page.get_by_role("button", name="Pause").click(force=True)  # live UI re-renders every 700 ms
        results["flow_simulation"] = "ok"

        # flow 3: RAG query
        page.goto(f"{BASE}/#/rag"); page.wait_for_load_state("networkidle")
        page.get_by_role("button", name="Ask").click()
        page.get_by_role("heading", name="Grounded answer").wait_for(timeout=30000)
        results["flow_rag"] = "ok"

        # flow 4: mobile layout
        m = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2).new_page()
        m.on("pageerror", lambda e: errors.append(f"mobile pageerror: {e}"))
        for path in ["/", "/diagnosis", "/simulation"]:
            m.goto(f"{BASE}/#{path}"); m.wait_for_load_state("networkidle"); time.sleep(0.8)
            m.screenshot(path=str(OUT / f"mobile_{path.strip('/') or 'home'}.png"), full_page=False)
        b.close()
    print(json.dumps({"pages": results, "errors": errors}, indent=1))
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
