import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import * as jwt from "jsonwebtoken";

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

// GET /api/admin/requests
// Returns all waste requests sorted by urgency then creation date.
// Supports optional ?status= and ?urgency= query params for filtering.
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const statusFilter  = searchParams.get("status");
    const urgencyFilter = searchParams.get("urgency");

    const query: Record<string, unknown> = {};
    if (statusFilter)  query.status  = statusFilter;
    if (urgencyFilter) query.urgency = urgencyFilter;

    const database = await connectDB();
    const requests = database.collection("waste_requests");

    const urgencyOrder = { high: 0, normal: 1, low: 2 };

    const docs = await requests
      .find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    // Sort by urgency then date in application layer
    docs.sort((a, b) => {
      const ua = urgencyOrder[a.urgency as keyof typeof urgencyOrder] ?? 3;
      const ub = urgencyOrder[b.urgency as keyof typeof urgencyOrder] ?? 3;
      if (ua !== ub) return ua - ub;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({
      requests: docs.map((r) => ({
        _id: r._id.toString(),
        userName: r.userName,
        userEmail: r.userEmail,
        address: r.address,
        location: r.location,
        wasteType: r.wasteType,
        amount: r.amount,
        urgency: r.urgency,
        status: r.status,
        createdAt: r.createdAt,
        collectorName: r.collectorName ?? null,
        hasOpenIssue: r.hasOpenIssue ?? false,
        preferredDate: r.preferredDate ?? null,
        preferredTime: r.preferredTime ?? null,
        description: r.description ?? "",
        imageUrls: r.imageUrls ?? [],   
        contactPhone: r.contactPhone ?? "", 
      })),
    });
  } catch (error) {
    console.error("Admin requests error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}