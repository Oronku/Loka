import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { getDatabase } from "../config/database.js";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

function isDatabaseUnavailableError(error) {
  if (!getDatabase()) return true;
  if (error?.message === "Database not available") return true;
  const name = error?.name || "";
  return (
    name === "MongoServerSelectionError" ||
    name === "MongoNetworkError" ||
    name === "MongoTimeoutError" ||
    name === "MongoNetworkTimeoutError"
  );
}

async function getUserFromDb(userId) {
  const db = getDatabase();
  if (!db) {
    throw new Error("Database not available");
  }

  const users = db.collection("users");
  const user = await users.findOne({ id: userId });
  return user;
}

function buildRequestUser(identity, dbUser) {
  return {
    id: identity.id,
    email: identity.email,
    name: identity.name,
    picture: identity.picture || null,
    isAdmin: dbUser?.isAdmin || false,
    isAgent: dbUser?.isAgent || false,
    isAgencyAdmin: dbUser?.isAgencyAdmin || false,
    agencyName: dbUser?.agencyName || null,
  };
}

export async function verifyGoogleToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.substring(7);

    let identity;
    let jwtError;

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      identity = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture || null,
      };
    } catch (error) {
      jwtError = error;
    }

    if (!identity) {
      try {
        const ticket = await client.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        identity = {
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          picture: payload.picture,
        };
      } catch (googleError) {
        console.error("Both JWT and Google token verification failed", {
          jwtName: jwtError?.name,
          jwtMessage: jwtError?.message,
          googleName: googleError?.name,
          googleMessage: googleError?.message,
        });
        if (jwtError?.name === "TokenExpiredError") {
          return res.status(401).json({
            error: "Invalid token",
            message: "Token expired",
            code: "TOKEN_EXPIRED",
          });
        }
        return res.status(401).json({ error: "Invalid token" });
      }
    }

    try {
      const dbUser = await getUserFromDb(identity.id);
      req.user = buildRequestUser(identity, dbUser);
      return next();
    } catch (dbError) {
      console.error(
        "Failed to load user after token verification:",
        dbError?.name,
        dbError?.message
      );
      if (isDatabaseUnavailableError(dbError)) {
        return res.status(503).json({ error: "Database not available" });
      }
      return res.status(500).json({ error: "Failed to load user" });
    }
  } catch (error) {
    console.error("Token verification failed:", error?.name, error?.message);
    return res.status(401).json({ error: "Invalid token" });
  }
}
