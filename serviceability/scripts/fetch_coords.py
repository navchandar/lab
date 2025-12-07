import googlemaps
import pandas as pd
import json
import os
import time

# CONFIGURATION
API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY' # Replace or use os.environ.get('GMAP_KEY')
INPUT_CSV = 'data/all_india_pin_code.csv'
OUTPUT_JSON = 'data/pincodes_latlng.json'

def fetch_coordinates():
    # Initialize Client
    gmaps = googlemaps.Client(key=API_KEY)
    
    # Load CSV
    df = pd.read_csv(INPUT_CSV)
    
    results = []
    
    print(f"Starting geocoding for {len(df)} entries...")

    for index, row in df.iterrows():
        # Construct specific query for highest accuracy
        # "Ada B.O, 504293, Adilabad, India"
        address = f"{row['officename']}, {row['pincode']}, {row['Districtname']}, India"
        
        try:
            # Geocode
            geocode_result = gmaps.geocode(address)
            
            if geocode_result:
                location = geocode_result[0]['geometry']['location']
                
                results.append({
                    "pin": str(row['pincode']), # Ensure string for consistency
                    "lat": location['lat'],
                    "lng": location['lng'],
                    "name": row['officename']
                })
                print(f"[{index+1}] Found: {row['pincode']}")
            else:
                # Fallback: Try just Pincode if specific building fails
                fallback_address = f"{row['pincode']}, India"
                fallback_result = gmaps.geocode(fallback_address)
                if fallback_result:
                    location = fallback_result[0]['geometry']['location']
                    results.append({
                        "pin": str(row['pincode']),
                        "lat": location['lat'],
                        "lng": location['lng'],
                        "name": f"Pincode {row['pincode']}"
                    })
                    print(f"[{index+1}] Fallback Found: {row['pincode']}")
                else:
                    print(f"[{index+1}] FAILED: {row['pincode']}")

        except Exception as e:
            print(f"Error on row {index}: {e}")
        
        # Google Maps Rate Limit safety 
        time.sleep(0.2) 

    # Save to JSON
    with open(OUTPUT_JSON, 'w') as f:
        json.dump(results, f, indent=2)
    
    print("Geocoding complete.")

if __name__ == "__main__":
    fetch_coordinates()