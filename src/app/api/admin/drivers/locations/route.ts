import { NextRequest, NextResponse } from "next/server";
import * as jwt from "jsonwebtoken";
import { connectDB } from "@/lib/mongodb";

const JWT_SECRET = process.env.JWT_SECRET as string;

function isAdmin(req: NextRequest) {
  try {
    const token = req.cookies.get("auth-token")?.value;
    if (!token) return false;
    const payload = jwt.verify(token, JWT_SECRET) as { role?: string };
    return payload.role === "admin" || payload.role === "dispatcher";
  } catch {
    return false;
  }
}

/**
 * GET /api/admin/drivers/locations
 *
 * Returns the last-known GPS position for every driver, plus the
 * coordinates of their active waste-request (if any) so the admin map
 * can draw a line from driver → job.
 *
 * A location is considered "stale" if it hasn't been updated in > 5 minutes.
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const database = await connectDB();

    // Fetch all driver location documents
    const locationDocs = await database
      .collection("driver_locations")
      .find({})
      .toArray();

    // Fetch all active requests so we can attach job coords to each driver
    // Active = en_route or collecting
    const activeRequests = await database
      .collection("waste_requests")
      .find({ status: { $in: ["en_route", "collecting", "assigned"] } })
      .project({ _id: 1, collectorId: 1, address: 1, location: 1, status: 1, userName: 1 })
      .toArray();

    // Index active requests by collectorId for O(1) lookup
    const requestByDriver: Record<string, typeof activeRequests[0]> = {};
    for (const r of activeRequests) {
      if (r.collectorId) requestByDriver[r.collectorId] = r;
    }

    const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    const locations = locationDocs.map((doc) => {
      const activeReq = requestByDriver[doc.userId] ?? null;
      const ageMs = now - new Date(doc.updatedAt).getTime();

      return {
        userId:     doc.userId,
        driverName: doc.driverName,
        lat:        doc.lat,
        lng:        doc.lng,
        accuracy:   doc.accuracy ?? null,
        updatedAt:  doc.updatedAt,
        isStale:    ageMs > STALE_THRESHOLD_MS,
        ageSeconds: Math.floor(ageMs / 1000),
        activeJob: activeReq
          ? {
              requestId: activeReq._id.toString(),
              address:   activeReq.address,
              location:  activeReq.location ?? null, // "lat,lng" string if geocoded
              status:    activeReq.status,
              userName:  activeReq.userName,
            }
          : null,
      };
    });

    return NextResponse.json({ locations });
  } catch (error) {
    console.error("Admin driver locations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}