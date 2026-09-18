"""Production E2E Lifecycle Smoke Test against live Render deployment."""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_URL = "https://ecoroute-api-q78j.onrender.com"

def run_test():
    print("======================================================================")
    print(f"🚀 RUNNING PRODUCTION SMOKE TEST AGAINST: {BASE_URL}")
    print("======================================================================")

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "EcoRouteLiveSmokeTest/1.0"
    }

    # 1. Health Probe
    print("\n[1/7] Probing /health endpoint...")
    req = urllib.request.Request(f"{BASE_URL}/health", headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=15) as resp:
        assert resp.status == 200, f"Health check failed with {resp.status}"
        health_data = json.loads(resp.read().decode("utf-8"))
        print(f"  ✓ HTTP {resp.status}: {json.dumps(health_data, indent=2)}")
        assert health_data["status"] == "healthy"
        assert health_data["environment"] == "production"
        assert health_data["components"]["database"]["status"] == "connected"
        assert health_data["components"]["redis"]["status"] == "connected"

    # 2. Query Active Regions
    print("\n[2/7] Querying active regions from /api/v1/regions...")
    req = urllib.request.Request(f"{BASE_URL}/api/v1/regions", headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=15) as resp:
        assert resp.status == 200
        regions = json.loads(resp.read().decode("utf-8"))
        print(f"  ✓ HTTP 200: Loaded {len(regions)} active regions from database.")
        assert len(regions) > 0, "No regions available!"
        region_map = {r["id"]: r for r in regions}
        print(f"  ✓ Sample regions: {[r['code'] for r in regions[:4]]}")

    # 3. Submit Workload (POST /api/v1/jobs)
    print("\n[3/7] Submitting computational workload (POST /api/v1/jobs)...")
    now = datetime.now(timezone.utc)
    deadline = (now + timedelta(hours=4)).isoformat()
    workload_payload = {
        "workload_name": f"prod-smoke-test-{int(now.timestamp())}",
        "workload_type": "BATCH",
        "cpu_demand": 4.0,
        "memory_demand": 16.0,
        "base_execution_duration": 5.0,  # 5 seconds execution
        "priority": 7,
        "deadline": deadline,
        "scheduler_variant": "ECOROUTE",
        "max_retries": 3,
        "carbon_weight": 0.4,
        "time_weight": 0.3,
        "utilization_weight": 0.2,
        "latency_weight": 0.1
    }
    print(f"  Request Payload:\n{json.dumps(workload_payload, indent=2)}")

    # Allow up to 90s for cold-cache multi-region carbon lookups across 25 regions
    post_data = json.dumps(workload_payload).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/api/v1/jobs", data=post_data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=90) as resp:
        assert resp.status == 201
        submit_res = json.loads(resp.read().decode("utf-8"))
        print(f"  ✓ HTTP 201 Created Response:\n{json.dumps(submit_res, indent=2)}")

    job = submit_res["job"]
    job_id = job["id"]
    decision_id = submit_res["decision_id"]
    dispatched_attempt_id = submit_res["dispatched_attempt_id"]
    selected_region_id = submit_res["selected_region_id"]
    selected_region = region_map.get(selected_region_id, {})

    print(f"  ✓ Job ID: {job_id}")
    print(f"  ✓ Initial Status: {job['status']}")
    print(f"  ✓ Decision ID: {decision_id} (Action: {submit_res['decision_action']})")
    print(f"  ✓ Selected Region ID: {selected_region_id} ({selected_region.get('code')}, {selected_region.get('name')})")
    print(f"  ✓ Dispatched Attempt ID: {dispatched_attempt_id}")

    # 4. Verify Decision Explainability
    print(f"\n[4/7] Inspecting Decision Explainability (/api/v1/scheduling/decisions/{decision_id})...")
    req = urllib.request.Request(f"{BASE_URL}/api/v1/scheduling/decisions/{decision_id}", headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=15) as resp:
        assert resp.status == 200
        decision_details = json.loads(resp.read().decode("utf-8"))
        print(f"  ✓ HTTP 200 Decision Explainability:\n{json.dumps(decision_details, indent=2)}")
        assert decision_details["decision_action"] == "EXECUTE"
        assert decision_details["cost_score_jr"] is not None
        assert decision_details["estimated_energy_kwh"] is not None
        assert len(decision_details.get("candidate_rankings", [])) > 0

    # 5. Poll for Worker Execution Completion
    print(f"\n[5/7] Waiting for embedded ExecutionWorker to process attempt and complete job...")
    max_wait_seconds = 20
    start_poll = time.time()
    final_job = None

    while time.time() - start_poll < max_wait_seconds:
        time.sleep(1.5)
        req = urllib.request.Request(f"{BASE_URL}/api/v1/jobs/{job_id}", headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:
            assert resp.status == 200
            job_state = json.loads(resp.read().decode("utf-8"))
            print(f"  ... polling job state: {job_state['status']} (attempt count: {job_state['current_attempt_count']})")
            if job_state["status"] in ("COMPLETED", "FAILED"):
                final_job = job_state
                break

    assert final_job is not None, f"Job did not reach terminal state within {max_wait_seconds} seconds!"
    print(f"  ✓ Final Job Status: {final_job['status']}")
    assert final_job["status"] == "COMPLETED", f"Expected job COMPLETED, but got {final_job['status']}"

    # 6. Retrieve Attempt Telemetry
    print(f"\n[6/7] Retrieving Attempt Telemetry (/api/v1/jobs/{job_id}/attempts)...")
    req = urllib.request.Request(f"{BASE_URL}/api/v1/jobs/{job_id}/attempts", headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=15) as resp:
        assert resp.status == 200
        attempts = json.loads(resp.read().decode("utf-8"))
        print(f"  ✓ HTTP 200 Attempts Found: {len(attempts)}")
        assert len(attempts) >= 1
        att = attempts[0]
        print(f"  ✓ Attempt #{att['attempt_number']} State:\n{json.dumps(att, indent=2)}")
        assert att["status"] == "COMPLETED"
        assert att["claimed_by_worker"] is not None
        assert att["actual_duration"] is not None and float(att["actual_duration"]) > 0
        assert att["actual_energy_kwh"] is not None and float(att["actual_energy_kwh"]) > 0

    # 7. Analytics Summary Verification
    print("\n[7/7] Verifying Global Analytics Summary (/api/v1/analytics/summary)...")
    req = urllib.request.Request(f"{BASE_URL}/api/v1/analytics/summary", headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=15) as resp:
        assert resp.status == 200
        analytics = json.loads(resp.read().decode("utf-8"))
        print(f"  ✓ HTTP 200 Analytics Summary:\n{json.dumps(analytics, indent=2)}")
        assert analytics["total_jobs"] >= 1
        assert analytics["completed_jobs"] >= 1

    print("\n" + "=" * 70)
    print("✅ PRODUCTION SMOKE TEST PASSED: ALL 7 PHASES SUCCEEDED AGAINST LIVE RENDER API")
    print("======================================================================")

if __name__ == "__main__":
    run_test()
