# Smart Kisan Mitra — Web Dashboard

![Dashboard Preview](https://github.com/user-attachments/assets/a7c34d5d-ec48-4525-adbe-57f1671d90fc)

## Overview

Smart Kisan Mitra — Web Dashboard is a real-time farm monitoring dashboard built on Next.js 14 and backed by a FastAPI gateway. It aggregates live IoT sensor telemetry, exposes ML-driven agronomic predictions, and surfaces historical trend data — all in a single, responsive interface.

## Features

**Real-time Sensor Monitoring**
Sensor readings (soil moisture, temperature, pH, NPK) are polled every 10 seconds and rendered as live time-series charts. Visual thresholds distinguish optimal ranges from critical readings at a glance.

**AI-powered Predictions**
The dashboard exposes four inference endpoints through a structured UI:
- Fertilizer recommendation based on soil nutrient levels, crop type, and growth stage
- Crop suitability scoring using sensor data and geo-location context
- Soil health analysis with a composite quality index
- Plant disease detection via leaf image upload and classification

**Historical Data**
Paginated table view of past sensor records with date-range filtering and CSV export. Readings can be compared across devices and time periods.

**Multi-device Support**
A device selector in the header allows switching between registered field sensors without a page reload.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14, React 18, TypeScript |
| Styling | Tailwind CSS |
| Animations | Framer Motion |
| Data Fetching | TanStack Query (React Query) |
| Charts | Recharts |
| HTTP Client | Axios |
| Backend | FastAPI (Python) |
| Database | MongoDB |

## Installation

**Prerequisites**
- Node.js 18+
- The Smart Kisan Mitra API gateway running and accessible

**Steps**

1. Clone the repository and navigate into the project directory.

```bash
git clone [https://github.com/Harshalvk/smart-kisan-mitra-.git](https://github.com/Harshalvk/Smart-Kisan-Mitra.git)
cd Smart-Kisan-Mitra
```

2. Install dependencies.

```bash
npm install
```

3. Create a `.env.local` file at the project root and configure the following variables.

```env
NEXT_PUBLIC_API_GATEWAY=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
```

4. Start the development server.

```bash
npm run dev
```

5. For a production build:

```bash
npm run build
npm start
```

The application is available at `http://localhost:3000`.

## Project Structure

```
smart-kisan-mitra-dashboard/
├── app/
│   ├── components/
│   │   ├── Sidebar.tsx          # Navigation menu
│   │   ├── Header.tsx           # Top bar with device selector
│   │   ├── SensorCard.tsx       # Individual sensor reading display
│   │   ├── PredictionCard.tsx   # Prediction request and response UI
│   │   ├── RealTimeMonitor.tsx  # Live chart component
│   │   ├── HistoryTable.tsx     # Paginated historical data table
│   │   └── QueryProvider.tsx    # TanStack Query context provider
│   ├── hooks/
│   │   ├── useWebSocket.ts      # WebSocket connection management
│   │   └── useRealTimeData.ts   # Polling and cache invalidation logic
│   ├── page.tsx                 # Root dashboard page
│   ├── layout.tsx               # Application shell and metadata
│   └── globals.css              # Global styles and Tailwind theme
├── public/
├── tailwind.config.js
├── next.config.js
└── package.json
```

## API Reference

All requests are made to the configured `NEXT_PUBLIC_API_GATEWAY` base URL.

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Gateway health check |
| `/history/{device_id}` | GET | Retrieve historical sensor records for a device |
| `/ingest` | POST | Submit new sensor readings |
| `/predict/fertilizer` | POST | Fertilizer recommendation |
| `/predict/crop` | POST | Crop suitability recommendation |
| `/predict/soil-health` | POST | Soil health analysis |
| `/predict/plant-disease` | POST | Plant disease classification from image |

## Docker

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t smart-kisan-dashboard .
docker run -p 3000:3000 smart-kisan-dashboard
```

## Dashboard Reference

### 1. Dashboard Overview

#### Real-Time Sensor Monitor

The main dashboard tab polls the API gateway every 10 seconds and renders live readings across four primary parameters — soil moisture, temperature, pH, and EC value — as interactive line charts. Each chart retains the last 20 readings to surface short-term trends. A pulse indicator in the header reflects the current connection state. Visual threshold bands on each chart distinguish optimal ranges from warning conditions without requiring manual interpretation.

#### Sensor Cards

Each card displays the current reading alongside its target value and unit:

| Parameter | Unit | Description |
|---|---|---|
| Soil Moisture | % | Current moisture level vs. target |
| Temperature | °C | Ambient soil temperature |
| pH Level | — | Soil acidity / alkalinity |
| EC Value | mS/cm | Electrical conductivity (proxy for nutrient concentration) |
| Nitrogen (N) | ppm | Available nitrogen |
| Phosphorus (P) | ppm | Available phosphorus |
| Potassium (K) | ppm | Available potassium |

#### AI Prediction Results Panel

The overview tab surfaces the two most operationally relevant prediction outputs inline:

- **Fertilizer Recommendation** — recommended fertilizer type, application rate (kg/acre), and timing derived from current NPK readings, crop type, and growth stage.
- **Soil Health Analysis** — composite health score (0–100), identified nutrient deficiencies, and prioritised improvement actions.

#### Sensor History Table

A sortable, filterable table beneath the charts logs every ingested reading with timestamp, device ID, all sensor parameters, and a color-coded status badge indicating whether each reading falls within optimal or warning thresholds.

---

### 2. AI Predictions Tab

Each prediction type maps to a dedicated inference endpoint on the API gateway. Inputs and outputs are as follows:

**Fertilizer Prediction**
- Input: device ID, crop type (Rice / Wheat / Maize / Cotton), growth stage (Vegetative / Flowering / Fruiting / Maturity)
- Output: NPK ratio recommendation, application rate in kg/acre, timing guidance

**Crop Recommendation**
- Input: device ID, latitude, longitude
- Output: ranked crop list for current soil conditions, confidence score per crop, seasonal suitability flags

**Soil Health Analysis**
- Input: device ID (the gateway auto-fetches the latest sensor snapshot)
- Output: composite health score, pH interpretation, EC interpretation, estimated organic matter percentage, nutrient-level recommendations

**Plant Disease Detection**
- Input: leaf image upload (JPEG or PNG)
- Output: predicted disease label, confidence score, treatment protocol, preventive measures

---

### 3. History Tab

The history tab provides a full audit trail of sensor readings with the following capabilities:

- Paginated record view across all ingested data
- Date-range and device ID filtering
- CSV export for offline analysis
- Multi-device comparison view
- Aggregated trend statistics at daily, weekly, and monthly resolution

---

### 4. Status Indicators

Color-coded badges and chart annotations are used consistently across the dashboard:

| Color | Meaning | Example Condition |
|---|---|---|
| 🟢 Green | Optimal | Soil moisture 60–80% |
| 🟠 Orange | Warning | Moisture below 40% or above 90% |
| 🔵 Blue | Informational | Weather data, actionable alerts |
| ⚪ Gray | Inactive / Disconnected | Device offline or historical-only record |

---

### 5. Real-Time Behavior

- Data polling runs on a 10-second interval via TanStack Query's `refetchInterval`, with cache invalidation on each cycle.
- Toast notifications surface prediction completions and gateway errors without blocking the UI.
- Animated transitions on chart updates and card re-renders are handled by Framer Motion.
- Optional WebSocket support enables server-push delivery of sensor readings, eliminating polling latency when the gateway has WebSocket capability enabled.

---

### 6. Multi-Device Support

A device selector dropdown in the header drives the active device context across all tabs. Each device maintains independent query state, so switching devices triggers a fresh data fetch without discarding cached readings from the previous device. A comparison mode allows simultaneous display of sensor data from multiple field devices on a single view.

---

### 7. Data Visualization

| Chart Type | Data |
|---|---|
| Line chart | Temporal trends — moisture, temperature, pH |
| Progress bar | Current reading vs. target value |
| Donut chart | Soil composition breakdown (optional) |
| Heat map | Field-level spatial data (planned extension) |

---

### 8. Alerts and Notifications (Planned)

The following capabilities are scoped for a future release:

- Threshold-based push alerts (e.g., moisture drop below 40%)
- Weather integration flagging upcoming drought or heavy rainfall risk
- Sensor maintenance reminders based on uptime and calibration intervals
- Prediction-driven actionable notifications (e.g., irrigation scheduling recommendations)
