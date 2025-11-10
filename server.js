// server.js
import express from "express";
import cors from "cors";
import https from "https";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import nodemailer from "nodemailer";
import cron from "node-cron";

const app = express();
const PORT = process.env.PORT || 9575; // match your deployment port
app.set('trust proxy', true);
const DATA_FILE = path.join(process.cwd(), "checkins.json");
const CSV_FILE = "checkins.csv";
const EXCEL_FILE = "checkins.xlsx";

// ✅ CORS setup (allow only your deployed frontend)
app.use(cors({
	//origin: "http://localhost:9575",
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST"],
  credentials: true
}));

app.use((req, res, next) => {
  console.log('=== IP DEBUG ===');
  console.log('req.ip:', req.ip);
  console.log('X-Forwarded-For:', req.headers['x-forwarded-for']);
  console.log('X-Real-IP:', req.headers['x-real-ip']);
  console.log('remoteAddress:', req.connection.remoteAddress);
  next();
});

app.use(bodyParser.json());
app.use(express.static("public"));

// --- Load existing check-ins ---
let checkins = [];
if (fs.existsSync(DATA_FILE)) {
  checkins = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

// --- Reference coordinates (ABSA Bishops Gate, Upperhill Nairobi) ---
const ALLOWED_LAT = -1.2910592;
const ALLOWED_LON = 36.8050176;
const ALLOWED_RADIUS_METERS = 1000;

// --- Helper: Distance formula ---
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
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

// --- Email Transport (Zimbra SMTP) ---
const transporter = nodemailer.createTransport({
  host: "mail.emtechhouse.co.ke",
  port: 587,
  secure: false,
  auth: {
    user: "bgichobi@emtechhouse.co.ke", // sender
    pass: "Emtech@123", // ⚠️ for security, move this to .env in production
  },
  tls: { rejectUnauthorized: false },
});

// --- Route: Check-in ---
app.post("/checkin", (req, res) => {
  try {
    const { deviceId, name, latitude, longitude } = req.body;
    const today = new Date().toISOString().slice(0, 10);

    if (!deviceId || !name || latitude == null || longitude == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const distance = getDistanceMeters(latitude, longitude, ALLOWED_LAT, ALLOWED_LON);
    if (distance > ALLOWED_RADIUS_METERS) {
      return res.status(403).json({ message: "You are away from site." });
    }

    const existing = checkins.find(
      (entry) => entry.deviceId === deviceId && entry.date === today
    );
    if (existing) {
      return res.status(409).json({ message: "Device already checked in today" });
    }

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

    // --- Generate Excel and CSV ---
    const ws = XLSX.utils.json_to_sheet(checkins);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Check-ins");
    XLSX.writeFile(wb, EXCEL_FILE);

    const csv = XLSX.utils.sheet_to_csv(ws);
    fs.writeFileSync(CSV_FILE, csv);

    console.log(`✅ Check-in saved for ${name}`);
    return res.json({ message: `Check-in successful for ${name}`, date: today });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// --- Daily Report Job (9:30 AM) ---
cron.schedule("30 9 * * *", async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (!fs.existsSync(CSV_FILE)) {
      console.log("📭 No check-ins yet to report.");
      return;
    }

    const mailOptions = {
      from: '"Check-in System" <bgichobi@emtechhouse.co.ke>',
      to: "jwanja@emtechhouse.co.ke, bgichobi@emtechhouse.co.ke, eodhiambo@emtechhouse.co.ke, nkariuki@emtechhouse.co.ke",
      subject: `Daily Check-in Report - ${today}`,
      text: `Attached is the team check-in report for ${today}.`,
      attachments: [{ filename: "checkins.csv", path: `./${CSV_FILE}` }],
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Report sent successfully for ${today}`);
  } catch (error) {
    console.error("❌ Failed to send report:", error);
  }
});

// --- Route: View all check-ins ---
app.get("/checkins", (req, res) => {
  res.json(checkins);
});

// --- Start server ---
// app.listen(PORT, () =>
//   console.log(`✅ Check-in API running on http://localhost:${PORT}`)
// );
const httpsOptions = {
  key: fs.readFileSync('/etc/ssl/certs/privkey.pem'),
  cert: fs.readFileSync('/etc/ssl/certs/cert.pem')
};

https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log(`✅ Secure Check-in API running on https://localhost:${PORT}`);
});
