const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * @route   POST /api/auth/signup
 * @desc    Register a new user.
 * @access  Public
 */
router.post('/signup', async (req, res) => {
    const { username, password, email, state, phone, dob } = req.body;

    // Validate that all required fields are provided
    if (!username || !password || !email || !state || !dob) {
        return res.status(400).json({ message: 'Please fill in all required fields.' });
    }

    try {
        // Check if username or email already exists
        let user = await User.findOne({ $or: [{ username }, { email }] });
        if (user) {
            return res.status(400).json({ message: 'Username or email already exists' });
        }

        // Create a new user instance
        user = new User({
            username,
            password,
            email,
            state,
            phone,
            dob
        });

        // Hash the password for security
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        // Save the new user to the database
        await user.save();

        // Send a success message, prompting the user to log in
        res.status(201).json({ message: 'User registered successfully! Please log in.' });

    } catch (err) {
        console.error('Error during signup:', err.message);
        res.status(500).send('Server error during user registration.');
    }
});

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate a user and get a token
 * @access  Public
 */
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Please provide a username and password.' });
    }

    try {
        let user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Create a JWT payload containing the user's unique ID
        const payload = {
            user: {
                id: user.id
            }
        };

        // Sign the token with your secret key
        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '5h' },
            (err, token) => {
                if (err) throw err;
                // Send the token back to the client
                res.json({ token, message: 'Login successful!' });
            }
        );
    } catch (err) {
        console.error('Error during login:', err.message);
        res.status(500).send('Server error during login.');
    }
});

// Middleware to protect routes by verifying the JWT
const protect = (req, res, next) => {
    // Get token from the Authorization header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Add user from payload to the request object
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token is not valid' });
    }
};

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user's profile information
 * @access  Private (protected by the 'protect' middleware)
 */
router.get('/profile', protect, async (req, res) => {
    try {
        // Find user by ID from the token payload, and exclude the password field from the result
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        console.error('Error fetching profile:', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;

