// server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs";

const app = express();
const PORT = 3000;
const DATA_FILE = "checkins.json";

app.use(cors());
app.use(bodyParser.json());

// --- Reference coordinates (ABSA Bishops Gate, Upperhill Nairobi) ---
const ALLOWED_LAT = -1.2910592;
const ALLOWED_LON = 36.8050176;
const ALLOWED_RADIUS_METERS = 1000; // ~1km radius

// --- Helper: Haversine formula for distance ---
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --- Load existing check-ins ---
let checkins = [];
try {
  if (fs.existsSync(DATA_FILE)) {
    checkins = JSON.parse(fs.readFileSync(DATA_FILE));
  }
} catch (err) {
  console.error("⚠️ Error loading checkins.json:", err);
  checkins = [];
}

// --- Route: Check-in ---
app.post("/checkin", (req, res) => {
  try {
    const { deviceId, name, latitude, longitude } = req.body;
    const today = new Date().toISOString().slice(0, 10);

    if (!deviceId || !name || latitude == null || longitude == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // --- Distance check ---
    const distance = getDistanceMeters(latitude, longitude, ALLOWED_LAT, ALLOWED_LON);
    console.log(`User '${name}' at ${latitude}, ${longitude} | Distance = ${distance.toFixed(1)} m`);
    if (distance > ALLOWED_RADIUS_METERS) {
      return res.status(403).json({ message: "Error verifying location" });
    }

    // --- One check-in per device per day ---
    const existing = checkins.find(
      (entry) => entry.deviceId === deviceId && entry.date === today
    );
    if (existing) {
      return res.status(409).json({ message: "Device already checked in today" });
    }

    // --- Save new check-in ---
    const record = {
      name,
      deviceId,
      latitude,
      longitude,
      date: today,
      time: new Date().toLocaleTimeString(),
      ip: req.ip,
    };

    checkins.push(record);
    fs.writeFileSync(DATA_FILE, JSON.stringify(checkins, null, 2));

    console.log(`✅ Check-in saved for ${name}`);
    return res.json({ message: `Check-in successful for ${name}`, date: today });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// --- Route: View all check-ins ---
app.get("/checkins", (req, res) => {
  res.json(checkins);
});

// --- Start server ---
app.listen(PORT, () => console.log(`✅ Check-in API running on http://localhost:${PORT}`));
