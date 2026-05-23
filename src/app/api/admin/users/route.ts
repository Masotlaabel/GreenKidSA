// Path: /app/api/admin/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import * as jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

function getAdminFromToken(req: NextRequest) {
  try {
    const token = req.cookies.get('auth-token')?.value
    if (!token) return null
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role?: string }
    if (payload.role !== 'admin' && payload.role !== 'dispatcher') return null
    return payload
  } catch { return null }
}

// GET /api/admin/users — list all registered users
export async function GET(req: NextRequest) {
  try {
    const caller = getAdminFromToken(req)
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = await connectDB()
    const users = await db
      .collection('users')
      .find({}, { projection: { passwordHash: 0, __v: 0 } })
      .sort({ createdAt: -1 })
      .toArray()

    const ONLINE_THRESHOLD_MS = 5 * 60 * 1000

    const mapped = users.map((u) => {
      const lastActive = u.lastActiveAt ? new Date(u.lastActiveAt).getTime() : 0
      return {
        id:                 u._id.toString(),
        name:               u.name,
        email:              u.email,
        role:               u.role               ?? 'user',
        phone:              u.phone              ?? '',
        address:            u.address            ?? '',
        totalPoints:        u.totalPoints        ?? 0,
        totalJobsCompleted: u.totalJobsCompleted ?? 0,
        totalKgCollected:   u.totalKgCollected   ?? 0,
        createdAt:          u.createdAt          ?? null,
        lastActiveAt:       u.lastActiveAt       ?? null,
        isOnline:           Date.now() - lastActive < ONLINE_THRESHOLD_MS,
      }
    })

    return NextResponse.json({ users: mapped })
  } catch (err) {
    console.error('GET /api/admin/users', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/admin/users — update a user's role
// Body: { userId: string, role: 'user' | 'driver' | 'admin' | 'dispatcher' }
export async function PATCH(req: NextRequest) {
  try {
    const caller = getAdminFromToken(req)
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Only full admins can change roles (not dispatchers)
    if (caller.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }

    const body = await req.json()
    const { userId, role } = body

    const ALLOWED_ROLES = ['user', 'driver', 'admin', 'dispatcher']
    if (!userId || !ObjectId.isValid(userId)) {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400 })
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: `Role must be one of: ${ALLOWED_ROLES.join(', ')}` }, { status: 400 })
    }

    // Prevent an admin from demoting themselves
    if (caller.userId === userId) {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })
    }

    const db = await connectDB()
    const result = await db.collection('users').findOneAndUpdate(
      { _id: new ObjectId(userId) },
      { $set: { role, updatedAt: new Date() } },
      { returnDocument: 'after', projection: { passwordHash: 0, __v: 0 } }
    )

    if (!result) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    return NextResponse.json({
      user: {
        id:    result._id.toString(),
        name:  result.name,
        email: result.email,
        role:  result.role,
      },
    })
  } catch (err) {
    console.error('PATCH /api/admin/users', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}