const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    verificationToken: { type: String },
    isVerified: { type: Boolean, default: false },
    name: { type: String },
    photo: { type: String },
    resume: { type: String }
});

module.exports = mongoose.model('User', userSchema);