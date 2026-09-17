#!/usr/bin/env python
"""
EcoRoute Infrastructure Connectivity Checker
Verifies live connectivity to Supabase PostgreSQL and Upstash/Redis without modifying data.
"""

import asyncio
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from app.core.config import get_settings
from app.db.session import check_db_connectivity
from app.infrastructure.redis import check_redis_connectivity


async def run_checks() -> int:
    settings = get_settings()

    print("=" * 60)
    print("EcoRoute Infrastructure Health & Connectivity Check")
    print("=" * 60)
    print(f"Environment: {settings.ENVIRONMENT}")
    print(f"Log Level:   {settings.LOG_LEVEL}")
    print("-" * 60)

    exit_code = 0

    # 1. PostgreSQL Check
    print("\n[1/2] Checking PostgreSQL / Supabase Connection...")
    if not settings.DATABASE_URL:
        print("  Status:  [UNCONFIGURED] (DATABASE_URL is not set in .env)")
    else:
        # Mask credentials in output
        db_scheme = settings.DATABASE_URL.split("://")[0]
        print(f"  Driver:  {db_scheme}")
        db_ok, db_msg = await check_db_connectivity()
        if db_ok:
            print("  Status:  [OK] Successfully connected (SELECT 1 passed)")
        else:
            print(f"  Status:  [FAILED] {db_msg}")
            exit_code = 1

    # 2. Redis Check
    print("\n[2/2] Checking Redis Connection...")
    if not settings.REDIS_URL:
        print("  Status:  [UNCONFIGURED] (REDIS_URL is not set in .env)")
    else:
        redis_scheme = settings.REDIS_URL.split("://")[0]
        print(f"  Scheme:  {redis_scheme}")
        redis_ok, redis_msg = await check_redis_connectivity()
        if redis_ok:
            print("  Status:  [OK] Successfully connected (PING -> PONG passed)")
        else:
            print(f"  Status:  [FAILED] {redis_msg}")
            exit_code = 1

    # 3. External API Configurations
    print("\n[3/3] Checking External Carbon Services...")
    if settings.ELECTRICITY_MAPS_API_KEY:
        masked_key = settings.ELECTRICITY_MAPS_API_KEY[:4] + "..." + settings.ELECTRICITY_MAPS_API_KEY[-4:] if len(settings.ELECTRICITY_MAPS_API_KEY) > 8 else "***"
        print(f"  Key:     [CONFIGURED] ({masked_key})")
        print(f"  URL:     {settings.ELECTRICITY_MAPS_API_URL}")
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                headers = {"auth-token": settings.ELECTRICITY_MAPS_API_KEY}
                # Test with zones endpoint (lightweight check of key authentication)
                resp = await client.get(f"{settings.ELECTRICITY_MAPS_API_URL}/zones", headers=headers)
                if resp.status_code == 200:
                    zones_data = resp.json()
                    zone_count = len(zones_data) if isinstance(zones_data, dict) else len(zones_data)
                    print(f"  Status:  [OK] Successfully authenticated ({zone_count} zones available)")
                elif resp.status_code == 401 or resp.status_code == 403:
                    print(f"  Status:  [FAILED] Authentication error (HTTP {resp.status_code}): Invalid API key")
                else:
                    print(f"  Status:  [WARNING] Received HTTP {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            print(f"  Status:  [WARNING] Could not reach Electricity Maps API: {e}")
    else:
        print("  Status:  [UNCONFIGURED] (ELECTRICITY_MAPS_API_KEY is not set in .env)")

    print("\n" + "=" * 60)
    if exit_code == 0:
        print("[SUCCESS] All configured infrastructure services are OPERATIONAL.")
    else:
        print("[ERROR] One or more infrastructure checks failed. See details above.")
    print("=" * 60)

    return exit_code


if __name__ == "__main__":
    code = asyncio.run(run_checks())
    sys.exit(code)
