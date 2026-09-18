import asyncio
import httpx
from app.core.config import get_settings
from app.carbon.client import ElectricityMapsClient

CANDIDATE_REGIONS = [
    # North America
    {"code": "us-east-1", "name": "US East (N. Virginia)", "provider": "AWS", "country": "USA", "lat": 38.13, "lon": -78.45, "zone": "US-MIDA-PJM"},
    {"code": "us-east-2", "name": "US East (Ohio)", "provider": "AWS", "country": "USA", "lat": 40.36, "lon": -82.99, "zone": "US-MIDW-MISO"},
    {"code": "us-west-1", "name": "US West (N. California)", "provider": "AWS", "country": "USA", "lat": 37.77, "lon": -122.41, "zone": "US-CAL-CISO"},
    {"code": "us-west-2", "name": "US West (Oregon)", "provider": "AWS", "country": "USA", "lat": 45.52, "lon": -122.67, "zone": "US-NW-PACW"},
    {"code": "ca-central-1", "name": "Canada (Central)", "provider": "AWS", "country": "Canada", "lat": 45.50, "lon": -73.56, "zone": "CA-QC"},
    {"code": "us-central1", "name": "US Central (Iowa)", "provider": "GCP", "country": "USA", "lat": 41.87, "lon": -93.09, "zone": "US-MIDW-MISO"},
    
    # South America
    {"code": "sa-east-1", "name": "South America (São Paulo)", "provider": "AWS", "country": "Brazil", "lat": -23.55, "lon": -46.63, "zone": "BR-CS"},
    
    # Europe
    {"code": "eu-north-1", "name": "Europe (Stockholm)", "provider": "AWS", "country": "Sweden", "lat": 59.32, "lon": 18.06, "zone": "SE-SE3"},
    {"code": "eu-west-1", "name": "Europe (Ireland)", "provider": "AWS", "country": "Ireland", "lat": 53.34, "lon": -6.26, "zone": "IE"},
    {"code": "eu-west-2", "name": "Europe (London)", "provider": "AWS", "country": "United Kingdom", "lat": 51.50, "lon": -0.12, "zone": "GB"},
    {"code": "eu-west-3", "name": "Europe (Paris)", "provider": "AWS", "country": "France", "lat": 48.85, "lon": 2.35, "zone": "FR"},
    {"code": "eu-central-1", "name": "Europe (Frankfurt)", "provider": "AWS", "country": "Germany", "lat": 50.11, "lon": 8.68, "zone": "DE"},
    {"code": "eu-central-2", "name": "Europe (Zurich)", "provider": "AWS", "country": "Switzerland", "lat": 47.37, "lon": 8.54, "zone": "CH"},
    {"code": "eu-south-1", "name": "Europe (Milan)", "provider": "AWS", "country": "Italy", "lat": 45.46, "lon": 9.19, "zone": "IT-NO"},
    {"code": "eu-south-2", "name": "Europe (Spain)", "provider": "AWS", "country": "Spain", "lat": 40.41, "lon": -3.70, "zone": "ES"},
    {"code": "europe-central2", "name": "Europe (Warsaw)", "provider": "GCP", "country": "Poland", "lat": 52.22, "lon": 21.01, "zone": "PL"},
    
    # Asia Pacific
    {"code": "ap-northeast-1", "name": "Asia Pacific (Tokyo)", "provider": "AWS", "country": "Japan", "lat": 35.67, "lon": 139.65, "zone": "JP-TK"},
    {"code": "ap-northeast-2", "name": "Asia Pacific (Seoul)", "provider": "AWS", "country": "South Korea", "lat": 37.56, "lon": 126.97, "zone": "KR"},
    {"code": "ap-northeast-3", "name": "Asia Pacific (Osaka)", "provider": "AWS", "country": "Japan", "lat": 34.69, "lon": 135.50, "zone": "JP-KN"},
    {"code": "ap-southeast-1", "name": "Asia Pacific (Singapore)", "provider": "AWS", "country": "Singapore", "lat": 1.35, "lon": 103.81, "zone": "SG"},
    {"code": "ap-southeast-2", "name": "Asia Pacific (Sydney)", "provider": "AWS", "country": "Australia", "lat": -33.86, "lon": 151.20, "zone": "AUS-NSW"},
    {"code": "ap-southeast-4", "name": "Asia Pacific (Melbourne)", "provider": "AWS", "country": "Australia", "lat": -37.81, "lon": 144.96, "zone": "AUS-VIC"},
    {"code": "ap-south-1", "name": "Asia Pacific (Mumbai)", "provider": "AWS", "country": "India", "lat": 19.07, "lon": 72.87, "zone": "IN-WE"},
    {"code": "ap-south-2", "name": "Asia Pacific (Hyderabad)", "provider": "AWS", "country": "India", "lat": 17.38, "lon": 78.48, "zone": "IN-SO"},
    
    # Middle East
    {"code": "me-central-1", "name": "Middle East (UAE)", "provider": "AWS", "country": "United Arab Emirates", "lat": 25.20, "lon": 55.27, "zone": "AE"},
]

async def check():
    client = ElectricityMapsClient()
    print(f"Testing {len(CANDIDATE_REGIONS)} candidate regions against Electricity Maps API...")
    
    for r in CANDIDATE_REGIONS:
        zone = r["zone"]
        try:
            live = await client.get_latest_carbon_intensity(zone)
            ci_str = f"{live.carbon_intensity} {live.unit} (estimated={live.is_estimated})"
        except Exception as e:
            ci_str = f"ERROR: {e}"
            
        try:
            fc = await client.get_carbon_intensity_forecast(zone)
            fc_str = f"{len(fc.points)} points" if fc and fc.points else "NO FORECAST"
        except Exception as e:
            fc_str = f"FC ERROR: {e}"
            
        print(f"[{r['code']}] {r['name']} -> Zone: {zone:12} | Live: {ci_str:35} | Forecast: {fc_str}")

if __name__ == "__main__":
    asyncio.run(check())
