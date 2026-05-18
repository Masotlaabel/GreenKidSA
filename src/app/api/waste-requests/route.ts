import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import * as jwt from "jsonwebtoken";

function getUserFromToken(req: NextRequest) {
  try {
    const token = req.cookies.get("auth-token")?.value;
    if (!token) return null;
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    return jwt.verify(token, secret) as unknown as {
      userId: string; name: string; email: string; role?: string;
    };
  } catch {
    return null;
  }
}

/**
 * Maps the internal driver-side statuses to the four statuses the
 * user-facing page understands. The driver writes:
 *   assigned → en_route → collecting → collected → verified
 * The user sees:
 *   pending → in_progress → collected → verified
 */
function toUserStatus(raw: string): string {
  switch (raw) {
    case "pending":    return "pending";
    case "assigned":   return "pending";      // assigned but driver hasn't started yet
    case "en_route":   return "in_progress";  // driver is heading over
    case "collecting": return "in_progress";  // driver is at the site
    case "collected":  return "collected";
    case "verified":   return "verified";
    case "cancelled":  return "cancelled";
    default:           return raw;
  }
}

// POST /api/waste-requests — create a new waste collection request
export async function POST(req: NextRequest) {
  try {
    const user = getUserFromToken(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      wasteType, amount, location, address, description,
      preferredDate, preferredTime, imageUrls, urgency, contactPhone,
    } = body;

    if (!wasteType || !location || !address) {
      return NextResponse.json(
        { error: "wasteType, location, and address are required" },
        { status: 400 }
      );
    }

    const database = await connectDB();
    const requests = database.collection("waste_requests");

    const doc = {
      userId:       user.userId,
      userName:  body.overrideUserName  || user.name,
      userEmail: body.overrideUserEmail || user.email,
      wasteType,
      amount:       amount || "Unknown",
      location,
      address,
      description:  description || "",
      preferredDate: preferredDate || null,
      preferredTime: preferredTime || null,
      urgency:      urgency || "normal",
      contactPhone: contactPhone || "",
      imageUrls:    imageUrls || [],
      status:       "pending",
      collectorId:  null,
      createdAt:    new Date(),
      updatedAt:    new Date(),
    };

    const result = await requests.insertOne(doc);

    return NextResponse.json({
      success:   true,
      requestId: result.insertedId.toString(),
      message:   "Waste collection request submitted successfully",
    });
  } catch (error) {
    console.error("Waste request POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/waste-requests — fetch requests for the logged-in user
// Returns the raw DB status plus a userStatus field so the UI can track
// both the detailed driver stage and the simplified four-step user view.
export async function GET(req: NextRequest) {
  try {
    const user = getUserFromToken(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const database = await connectDB();
    const requests = database.collection("waste_requests");

    const userRequests = await requests
      .find({ userId: user.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    const serialised = userRequests.map(r => ({
      ...r,
      _id:        r._id.toString(),
      // Keep the raw status for the admin/driver side, add a user-facing one
      rawStatus:  r.status,
      status:     toUserStatus(r.status as string),
      // Provide a human-readable driver stage for display in the card
      driverStage: r.status,
    }));

    return NextResponse.json({ requests: serialised });
  } catch (error) {
    console.error("Waste request GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}