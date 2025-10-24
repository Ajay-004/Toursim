const mongoose = require('mongoose');

/**
 * @desc Defines the structure for user documents in the MongoDB database.
 */
const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    state: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        unique: true,
        sparse: true // Allows multiple users to register without a phone number
    },
    dob: {
        type: Date,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('user', UserSchema);

