import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import * as jwt from "jsonwebtoken";
import { connectDB } from "@/lib/mongodb";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

function getUserFromToken(req: NextRequest) {
  try {
    const token = req.cookies.get("auth-token")?.value;
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET) as {
      userId: string; name: string; email: string; role?: string;
    };
  } catch {
    return null;
  }
}

/**
 * POST /api/driver/location
 * Body: { lat: number; lng: number; accuracy?: number }
 *
 * Upserts the driver's current GPS position into the `driver_locations`
 * collection (one document per driver, keyed on userId).
 * Also stamps `lastActiveAt` on the user record.
 */
export async function POST(req: NextRequest) {
  const user = getUserFromToken(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { lat?: number; lng?: number; accuracy?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { lat, lng, accuracy } = body;
  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  try {
    const database = await connectDB();

    const locationPayload = {
      userId:    user.userId,
      driverName: user.name,
      lat,
      lng,
      accuracy:  accuracy ?? null,
      updatedAt: new Date(),
    };

    // Upsert — one document per driver
    await database.collection("driver_locations").updateOne(
      { userId: user.userId },
      { $set: locationPayload },
      { upsert: true }
    );

    // Update presence on the user record (non-critical)
    try {
      await database.collection("users").updateOne(
        { _id: new ObjectId(user.userId) },
        { $set: { lastActiveAt: new Date() } }
      );
    } catch { /* ignore */ }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Driver location POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/driver/location
 * Returns the calling driver's own last known location.
 */
export async function GET(req: NextRequest) {
  const user = getUserFromToken(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const database = await connectDB();
    const doc = await database
      .collection("driver_locations")
      .findOne({ userId: user.userId });

    return NextResponse.json({
      location: doc
        ? { lat: doc.lat, lng: doc.lng, accuracy: doc.accuracy, updatedAt: doc.updatedAt }
        : null,
    });
  } catch (error) {
    console.error("Driver location GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}