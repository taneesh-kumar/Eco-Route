import asyncio
from app.carbon.client import ElectricityMapsClient

AWS_25_TOPOLOGY = [
    # North America (5)
    {"code": "us-east-1", "name": "US East (N. Virginia)", "provider": "AWS", "country": "USA", "lat": 38.13, "lon": -78.45, "zone": "US-MIDA-PJM"},
    {"code": "us-east-2", "name": "US East (Ohio)", "provider": "AWS", "country": "USA", "lat": 40.36, "lon": -82.99, "zone": "US-MIDW-MISO"},
    {"code": "us-west-1", "name": "US West (N. California)", "provider": "AWS", "country": "USA", "lat": 37.77, "lon": -122.41, "zone": "US-CAL-CISO"},
    {"code": "us-west-2", "name": "US West (Oregon)", "provider": "AWS", "country": "USA", "lat": 45.52, "lon": -122.67, "zone": "US-NW-PACW"},
    {"code": "ca-central-1", "name": "Canada (Central)", "provider": "AWS", "country": "Canada", "lat": 45.50, "lon": -73.56, "zone": "CA-QC"},
    {"code": "ca-west-1", "name": "Canada (Calgary)", "provider": "AWS", "country": "Canada", "lat": 51.04, "lon": -114.07, "zone": "CA-AB"},

    # South America (1)
    {"code": "sa-east-1", "name": "South America (São Paulo)", "provider": "AWS", "country": "Brazil", "lat": -23.55, "lon": -46.63, "zone": "BR-CS"},

    # Europe (9)
    {"code": "eu-north-1", "name": "Europe (Stockholm)", "provider": "AWS", "country": "Sweden", "lat": 59.32, "lon": 18.06, "zone": "SE-SE3"},
    {"code": "eu-west-1", "name": "Europe (Ireland)", "provider": "AWS", "country": "Ireland", "lat": 53.34, "lon": -6.26, "zone": "IE"},
    {"code": "eu-west-2", "name": "Europe (London)", "provider": "AWS", "country": "United Kingdom", "lat": 51.50, "lon": -0.12, "zone": "GB"},
    {"code": "eu-west-3", "name": "Europe (Paris)", "provider": "AWS", "country": "France", "lat": 48.85, "lon": 2.35, "zone": "FR"},
    {"code": "eu-central-1", "name": "Europe (Frankfurt)", "provider": "AWS", "country": "Germany", "lat": 50.11, "lon": 8.68, "zone": "DE"},
    {"code": "eu-central-2", "name": "Europe (Zurich)", "provider": "AWS", "country": "Switzerland", "lat": 47.37, "lon": 8.54, "zone": "CH"},
    {"code": "eu-south-1", "name": "Europe (Milan)", "provider": "AWS", "country": "Italy", "lat": 45.46, "lon": 9.19, "zone": "IT-NO"},
    {"code": "eu-south-2", "name": "Europe (Spain)", "provider": "AWS", "country": "Spain", "lat": 40.41, "lon": -3.70, "zone": "ES"},

    # Africa / Middle East (2)
    {"code": "af-south-1", "name": "Africa (Cape Town)", "provider": "AWS", "country": "South Africa", "lat": -33.92, "lon": 18.42, "zone": "ZA"},
    {"code": "me-central-1", "name": "Middle East (UAE)", "provider": "AWS", "country": "United Arab Emirates", "lat": 25.20, "lon": 55.27, "zone": "AE"},

    # Asia-Pacific + India (8)
    {"code": "ap-northeast-1", "name": "Asia Pacific (Tokyo)", "provider": "AWS", "country": "Japan", "lat": 35.67, "lon": 139.65, "zone": "JP-TK"},
    {"code": "ap-northeast-2", "name": "Asia Pacific (Seoul)", "provider": "AWS", "country": "South Korea", "lat": 37.56, "lon": 126.97, "zone": "KR"},
    {"code": "ap-northeast-3", "name": "Asia Pacific (Osaka)", "provider": "AWS", "country": "Japan", "lat": 34.69, "lon": 135.50, "zone": "JP-KN"},
    {"code": "ap-southeast-1", "name": "Asia Pacific (Singapore)", "provider": "AWS", "country": "Singapore", "lat": 1.35, "lon": 103.81, "zone": "SG"},
    {"code": "ap-southeast-2", "name": "Asia Pacific (Sydney)", "provider": "AWS", "country": "Australia", "lat": -33.86, "lon": 151.20, "zone": "AUS-NSW"},
    {"code": "ap-southeast-4", "name": "Asia Pacific (Melbourne)", "provider": "AWS", "country": "Australia", "lat": -37.81, "lon": 144.96, "zone": "AUS-VIC"},
    {"code": "ap-south-1", "name": "Asia Pacific (Mumbai)", "provider": "AWS", "country": "India", "lat": 19.07, "lon": 72.87, "zone": "IN-WE"},
    {"code": "ap-south-2", "name": "Asia Pacific (Hyderabad)", "provider": "AWS", "country": "India", "lat": 17.38, "lon": 78.48, "zone": "IN-SO"},
]

async def verify():
    client = ElectricityMapsClient()
    print(f"Total regions in canonical AWS topology: {len(AWS_25_TOPOLOGY)}")
    for r in AWS_25_TOPOLOGY:
        try:
            live = await client.get_latest_carbon_intensity(r['zone'])
            fc = await client.get_carbon_intensity_forecast(r['zone'])
            fc_count = len(fc.points) if fc and fc.points else 0
            print(f"OK: {r['code']:15} | Zone: {r['zone']:12} | CI: {live.carbon_intensity} {live.unit} | Forecast pts: {fc_count}")
        except Exception as e:
            print(f"FAIL: {r['code']:15} | Zone: {r['zone']:12} | Error: {e}")

if __name__ == "__main__":
    asyncio.run(verify())
