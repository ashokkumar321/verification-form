const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: String,
    verificationToken: String,
    isVerified: { type: Boolean, default: false }
});

module.exports = mongoose.model('User', userSchema);
