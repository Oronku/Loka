import express from "express";
import { verifyGoogleToken } from "../middleware/auth.js";
import { getDb } from "../config/database.js";

const router = express.Router();

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  // For now, check if user has isAdmin flag
  // You can customize this based on your user model
  if (!req.user?.isAdmin) {
    return res.status(403).json({ message: "Access denied. Admin only." });
  }
  next();
};

// Apply auth and isAdmin to all routes
router.use(verifyGoogleToken, isAdmin);

// ==================== USERS STATISTICS ====================
router.get("/users/statistics", async (req, res) => {
  try {
    const db = await getDb();
    const now = new Date();
    const monthAgo = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      now.getDate()
    );

    const users = await db.collection("users").find({}).toArray();
    const totalUsers = users.length;

    // Active users (simplified - users with recent activity)
    const activeUsers = users.filter(
      (u) => u.lastLoginAt && new Date(u.lastLoginAt) > monthAgo
    ).length;

    // New users this month
    const newUsersThisMonth = users.filter(
      (u) => new Date(u.createdAt) > monthAgo
    ).length;

    // User growth - mock data for now
    const userGrowth = [
      { month: "Jan 2026", users: 12 },
      { month: "Feb 2026", users: 19 },
      { month: "Mar 2026", users: 25 },
      { month: "Apr 2026", users: 31 },
      { month: "May 2026", users: 38 },
      { month: "Jun 2026", users: 45 },
      { month: "Jul 2026", users: 52 },
      { month: "Aug 2026", users: 61 },
      { month: "Sep 2026", users: 68 },
      { month: "Oct 2026", users: 76 },
      { month: "Nov 2026", users: 85 },
      { month: "Dec 2026", users: totalUsers },
    ];

    // Recent users with trip counts
    const recentUsers = users.slice(-10).reverse();
    const usersWithTripCount = await Promise.all(
      recentUsers.map(async (user) => {
        const tripsCount = await db.collection("trips").countDocuments({
          $or: [{ owner: user._id }, { sharedWith: user._id }],
        });
        return {
          id: user._id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
          tripsCount,
        };
      })
    );

    res.json({
      totalUsers,
      activeUsers,
      newUsersThisMonth,
      userGrowth,
      recentUsers: usersWithTripCount,
    });
  } catch (error) {
    console.error("Error fetching user statistics:", error);
    res.status(500).json({ message: "Error fetching user statistics" });
  }
});

// ==================== DESTINATIONS STATISTICS ====================
router.get("/destinations/statistics", async (req, res) => {
  try {
    const db = await getDb();
    const trips = await db.collection("trips").find({}).toArray();

    const destinationMap = new Map();
    let totalTrips = 0;

    trips.forEach((trip) => {
      totalTrips++;
      if (trip.destinations && Array.isArray(trip.destinations)) {
        trip.destinations.forEach((dest) => {
          const destName =
            typeof dest === "string" ? dest : dest.name || "Unknown";
          const country =
            typeof dest === "object" && dest.country ? dest.country : "Unknown";

          if (destinationMap.has(destName)) {
            destinationMap.get(destName).count++;
          } else {
            destinationMap.set(destName, { name: destName, country, count: 1 });
          }
        });
      }
    });

    const topDestinations = Array.from(destinationMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Mock destinations by continent
    const destinationsByContinent = [
      { continent: "Europe", count: Math.floor(topDestinations.length * 0.35) },
      { continent: "Asia", count: Math.floor(topDestinations.length * 0.25) },
      {
        continent: "North America",
        count: Math.floor(topDestinations.length * 0.2),
      },
      {
        continent: "South America",
        count: Math.floor(topDestinations.length * 0.1),
      },
      { continent: "Other", count: Math.floor(topDestinations.length * 0.1) },
    ];

    res.json({
      totalDestinations: destinationMap.size,
      totalTrips,
      topDestinations,
      destinationsByContinent,
    });
  } catch (error) {
    console.error("Error fetching destination statistics:", error);
    res.status(500).json({ message: "Error fetching destination statistics" });
  }
});

// ==================== FLIGHTS STATISTICS ====================
router.get("/flights/statistics", async (req, res) => {
  try {
    const db = await getDb();
    const trips = await db.collection("trips").find({}).toArray();

    let totalFlights = 0;
    let domesticFlights = 0;
    let internationalFlights = 0;
    const routeMap = new Map();
    const airlineMap = new Map();

    trips.forEach((trip) => {
      if (trip.flights && Array.isArray(trip.flights)) {
        trip.flights.forEach((flight) => {
          totalFlights++;

          // Simplified domestic vs international check
          const isDomestic =
            flight.departureAirportCode?.length ===
            flight.arrivalAirportCode?.length;
          if (isDomestic) domesticFlights++;
          else internationalFlights++;

          // Routes
          if (flight.departureAirportCode && flight.arrivalAirportCode) {
            const route = `${flight.departureAirportCode} → ${flight.arrivalAirportCode}`;
            routeMap.set(route, (routeMap.get(route) || 0) + 1);
          }

          // Airlines
          if (flight.airline) {
            airlineMap.set(
              flight.airline,
              (airlineMap.get(flight.airline) || 0) + 1
            );
          }
        });
      }
    });

    const popularRoutes = Array.from(routeMap.entries())
      .map(([route, count]) => ({ route, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const popularAirlines = Array.from(airlineMap.entries())
      .map(([airline, count]) => ({ airline, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Mock flights by month
    const flightsByMonth = [
      { month: "Jan", count: Math.floor(totalFlights * 0.08) },
      { month: "Feb", count: Math.floor(totalFlights * 0.07) },
      { month: "Mar", count: Math.floor(totalFlights * 0.09) },
      { month: "Apr", count: Math.floor(totalFlights * 0.1) },
      { month: "May", count: Math.floor(totalFlights * 0.09) },
      { month: "Jun", count: Math.floor(totalFlights * 0.08) },
      { month: "Jul", count: Math.floor(totalFlights * 0.1) },
      { month: "Aug", count: Math.floor(totalFlights * 0.09) },
      { month: "Sep", count: Math.floor(totalFlights * 0.08) },
      { month: "Oct", count: Math.floor(totalFlights * 0.08) },
      { month: "Nov", count: Math.floor(totalFlights * 0.07) },
      { month: "Dec", count: Math.floor(totalFlights * 0.07) },
    ];

    res.json({
      totalFlights,
      domesticFlights,
      internationalFlights,
      popularRoutes,
      popularAirlines,
      flightsByMonth,
    });
  } catch (error) {
    console.error("Error fetching flight statistics:", error);
    res.status(500).json({ message: "Error fetching flight statistics" });
  }
});

// ==================== TRIPS STATISTICS ====================
router.get("/trips/statistics", async (req, res) => {
  try {
    const db = await getDb();
    const trips = await db.collection("trips").find({}).toArray();
    const now = new Date();

    const totalTrips = trips.length;
    let upcomingTrips = 0;
    let ongoingTrips = 0;
    let completedTrips = 0;
    let totalDuration = 0;
    let validDurationCount = 0;

    trips.forEach((trip) => {
      const startDate = new Date(trip.startDate);
      const endDate = new Date(trip.endDate);

      // Calculate status
      if (startDate > now) upcomingTrips++;
      else if (startDate <= now && endDate >= now) ongoingTrips++;
      else completedTrips++;

      // Calculate duration
      if (trip.startDate && trip.endDate) {
        const duration = Math.ceil(
          (endDate - startDate) / (1000 * 60 * 60 * 24)
        );
        if (duration > 0 && duration < 365) {
          totalDuration += duration;
          validDurationCount++;
        }
      }
    });

    const averageDuration =
      validDurationCount > 0
        ? Math.round(totalDuration / validDurationCount)
        : 0;

    // Mock trips by month
    const tripsByMonth = [
      { month: "Jan", count: Math.floor(totalTrips * 0.08) },
      { month: "Feb", count: Math.floor(totalTrips * 0.07) },
      { month: "Mar", count: Math.floor(totalTrips * 0.09) },
      { month: "Apr", count: Math.floor(totalTrips * 0.1) },
      { month: "May", count: Math.floor(totalTrips * 0.09) },
      { month: "Jun", count: Math.floor(totalTrips * 0.08) },
      { month: "Jul", count: Math.floor(totalTrips * 0.1) },
      { month: "Aug", count: Math.floor(totalTrips * 0.09) },
      { month: "Sep", count: Math.floor(totalTrips * 0.08) },
      { month: "Oct", count: Math.floor(totalTrips * 0.08) },
      { month: "Nov", count: Math.floor(totalTrips * 0.07) },
      { month: "Dec", count: Math.floor(totalTrips * 0.07) },
    ];

    const tripsByStatus = [
      { status: "Upcoming", count: upcomingTrips },
      { status: "Ongoing", count: ongoingTrips },
      { status: "Completed", count: completedTrips },
    ];

    res.json({
      totalTrips,
      upcomingTrips,
      ongoingTrips,
      completedTrips,
      averageDuration,
      tripsByMonth,
      tripsByStatus,
    });
  } catch (error) {
    console.error("Error fetching trip statistics:", error);
    res.status(500).json({ message: "Error fetching trip statistics" });
  }
});

// ==================== USER MANAGEMENT ====================
// Toggle admin status for a user
router.post("/users/:userId/toggle-admin", async (req, res) => {
  try {
    const db = await getDb();
    const { userId } = req.params;
    const { ObjectId } = await import("mongodb");

    // Get the user to toggle
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Prevent removing admin from yourself
    if (userId === req.user.userId) {
      return res
        .status(400)
        .json({ message: "Cannot modify your own admin status" });
    }

    // Toggle admin status
    const newAdminStatus = !user.isAdmin;

    await db
      .collection("users")
      .updateOne(
        { _id: new ObjectId(userId) },
        { $set: { isAdmin: newAdminStatus } }
      );

    res.json({
      success: true,
      message: `User ${user.name} is now ${newAdminStatus ? "an admin" : "not an admin"}`,
      isAdmin: newAdminStatus,
    });
  } catch (error) {
    console.error("Error toggling admin status:", error);
    res.status(500).json({ message: "Error updating user admin status" });
  }
});

// Get all users (for admin management)
router.get("/users/all", async (req, res) => {
  try {
    const db = await getDb();
    const users = await db
      .collection("users")
      .find({})
      .project({
        name: 1,
        email: 1,
        isAdmin: 1,
        createdAt: 1,
        lastLoginAt: 1,
        picture: 1,
      })
      .sort({ createdAt: -1 })
      .toArray();

    // Get trip counts for each user
    const usersWithCounts = await Promise.all(
      users.map(async (user) => {
        const tripsCount = await db.collection("trips").countDocuments({
          $or: [{ owner: user._id }, { sharedWith: user._id }],
        });
        return {
          ...user,
          tripsCount,
        };
      })
    );

    res.json(usersWithCounts);
  } catch (error) {
    console.error("Error fetching all users:", error);
    res.status(500).json({ message: "Error fetching users" });
  }
});

export default router;
