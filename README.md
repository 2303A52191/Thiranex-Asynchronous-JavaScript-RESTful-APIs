# Weather Dashboard (Async JavaScript + REST API)

## What this project does
This is a simple **real-time Weather Dashboard** made with **plain HTML/CSS/JavaScript**.
It fetches weather data from a public REST API and updates the page using **async/await**.

## Features
- Fetches live weather using the modern **Fetch API** + **async/await**
- Works with **city search** (type a city name and submit)
- Also supports **Use my location** (browser geolocation)
- Displays key metrics from the JSON:
  - Temperature
  - Humidity
  - Wind speed
  - Feels like (uses the API value when available, otherwise a small approximation)
- Shows loading state and **proper error handling** for network/API failures
- Parses and renders a **nested JSON object** in the “Parsed JSON Details” section

## Folder structure
```
Asynchronous JavaScript & RESTful APIs/
├── index.html
├── style.css
└── js/
    └── app.js
```

## How to run
1. Open `index.html` in a browser.
   - Example: right click → **Open with Live Server** (VS Code) is fine.
2. Type a city name like **London**, **Paris**, **New York**, etc.
3. Click **Get weather**.

## APIs used (no API key)
- Geocoding (city name → latitude/longitude): Open-Meteo Geocoding API
- Weather forecast (current + hourly): Open-Meteo Forecast API

Because Open-Meteo does not require an API key, the dashboard should work directly.

## Notes
- If you see an error like “No results found”, try a different city spelling.
- Weather values depend on the remote API data.

