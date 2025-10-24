require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Import all route handlers for the different features
const authRoutes = require('./routes/auth');
const plannerRoutes = require('./routes/planner');
const mapRoutes = require('./routes/map');

const placeRoutes = require('./routes/places'); // <-- ADDED: Import place routes

// Initialize the Express application
const app = express();

// --- Database Connection ---
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error('MongoDB Connection Error:', err.message);
        // Exit the process with a failure code if the database connection fails
        process.exit(1);
    }
};
connectDB();

// --- Middleware Setup ---
// Enable Cross-Origin Resource Sharing (CORS) to allow the frontend to communicate with this backend
app.use(cors());
// Enable the Express app to parse incoming request bodies with JSON payloads
app.use(express.json());

// --- API Route Definitions ---
// Mount the route handlers to their specific base paths
app.use('/api/auth', authRoutes);
app.use('/api/plan-trip', plannerRoutes);
app.use('/api/map', mapRoutes);

app.use('/api/find-places', placeRoutes); // <-- ADDED: Use place routes

// Define the port the server will run on, using an environment variable or defaulting to 5000
const PORT = process.env.PORT || 5000;

// --- Start the Server ---
// Make the server listen for incoming requests on the specified port
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));