import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectToDatabase, closeDatabase } from './config/database.js';
import authRoutes from './routes/auth.js';
import hotelRoutes from './routes/hotels.js';
import rideRoutes from './routes/rides.js';
import placesRoutes from './routes/places.js';
import flightRoutes from './routes/flights.js';
import tripRoutes from './routes/trips.js';
import quicketRoutes from './routes/quicket.js';
import chatRoutes from './routes/chats.js';
import friendRoutes from './routes/friends.js';
import checkInRoutes from './routes/checkins.js';
import aiRoutes from './routes/ai.js';
import budgetRoutes from './routes/budgets.js';
import weatherRoutes from './routes/weather.js';
import adminRoutes from './routes/admin.js';
import agentRoutes from './routes/agent.js';
import agencyRoutes from './routes/agency.js';
import organizedTripsRoutes from './routes/organizedTrips.js';

const app = express();
const PORT = process.env.PORT || 3001;

const PRODUCTION_ORIGINS = [
	'https://meetloka.com',
	'https://www.meetloka.com',
	'https://meetloka-front.vercel.app',
	...(process.env.CORS_ORIGINS?.split(',')
		.map((o) => o.trim())
		.filter(Boolean) ?? []),
];
const DEV_ORIGINS = [
	'http://localhost:5190',
	'http://localhost:5191',
	'http://localhost:5192',
	'http://localhost:8081', // Expo web (Metro)
	'http://127.0.0.1:8081',
	'http://localhost:19006', // legacy Expo web port
];

const isDev = process.env.NODE_ENV !== 'production';
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const LAN_ORIGIN = /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/;
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/meetloka-front(-[a-zA-Z0-9-]+)?\.vercel\.app$/;

function corsOrigin(origin, callback) {
	if (!origin) return callback(null, true);
	if (PRODUCTION_ORIGINS.includes(origin)) return callback(null, true);
	if (VERCEL_PREVIEW_ORIGIN.test(origin)) return callback(null, true);
	if (DEV_ORIGINS.includes(origin)) return callback(null, true);
	if (isDev && (LOCAL_ORIGIN.test(origin) || LAN_ORIGIN.test(origin))) return callback(null, true);
	callback(new Error(`CORS blocked origin: ${origin}`));
}

// Middleware
app.use(
	cors({
		origin: corsOrigin,
		credentials: true,
	}),
);
app.use(express.json());

// Request logger
app.use((req, res, next) => {
	console.log(`${req.method} ${req.path}`, {
		params: req.params,
		hasAuth: !!req.headers.authorization,
	});
	next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/places', placesRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/quicket', quicketRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/checkins', checkInRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/agency', agencyRoutes); // Agency management for agency admins
app.use('/api/organized-trips', organizedTripsRoutes); // Public organized trips

// Health check
app.get('/api/health', (req, res) => {
	res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
	console.error(err.stack);
	res.status(500).json({
		error: 'Something went wrong!',
		message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
	});
});

// 404 handler
app.use('*', (req, res) => {
	res.status(404).json({ error: 'Route not found' });
});

// Start server with MongoDB connection
async function startServer() {
	try {
		// Try to connect to MongoDB
		await connectToDatabase();
		console.log('✓ Connected to MongoDB');

		app.listen(PORT, () => {
			console.log(`✓ Server running on port ${PORT}`);
			console.log('✓ Using MongoDB for persistent storage');
			console.log('✓ All API endpoints ready');
		});
	} catch (error) {
		console.error('⚠️  Failed to connect to MongoDB, falling back to in-memory storage');
		app.listen(PORT, () => {
			console.log(`✓ Server running on port ${PORT}`);
			console.log('⚠️  Using in-memory storage (MongoDB connection failed)');
			console.log('✓ All API endpoints ready');
		});
	}
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
	console.log('\nShutting down gracefully...');
	await closeDatabase();
	process.exit(0);
});
