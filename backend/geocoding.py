"""
Reverse geocoding utility for TAASA system.
Converts GPS coordinates to human-readable place names.
Uses OpenStreetMap Nominatim API (free, no API key required).
"""

import urllib.request
import urllib.parse
import json


def get_place_name(latitude: float, longitude: float) -> str:
    """
    Convert latitude/longitude to a place name using reverse geocoding.
    Returns place name or empty string if geocoding fails.
    """
    try:
        # Build Nominatim API URL
        base_url = "https://nominatim.openstreetmap.org/reverse"
        params = {
            "lat": latitude,
            "lon": longitude,
            "format": "json",
            "zoom": 16,  # Street level detail
            "addressdetails": 1
        }
        url = f"{base_url}?{urllib.parse.urlencode(params)}"
        
        # Make request with User-Agent (required by Nominatim)
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "TAASA-Safety-System/1.0"}
        )
        
        with urllib.request.urlopen(request, timeout=5) as response:
            data = json.loads(response.read().decode())
        
        # Extract place name from response
        address = data.get("address", {})
        
        # Try to get the most relevant place name
        place_name = (
            address.get("suburb") or
            address.get("neighbourhood") or
            address.get("village") or
            address.get("town") or
            address.get("city_district") or
            address.get("city") or
            address.get("county") or
            ""
        )
        
        return place_name
        
    except Exception as e:
        # Return empty string if geocoding fails (network issues, etc.)
        print(f"Geocoding failed: {e}")
        return ""


def format_location(latitude: float, longitude: float) -> str:
    """
    Format location as coordinates with place name.
    Example: "0.3216, 32.6214, Mbuya"
    """
    place_name = get_place_name(latitude, longitude)
    
    coords = f"{latitude:.4f}, {longitude:.4f}"
    
    if place_name:
        return f"{coords}, {place_name}"
    return coords
