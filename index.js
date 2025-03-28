const express = require('express');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const multer = require('multer');
const twilio = require('twilio');
const path = require('path');
require('dotenv').config();

const User = require('./models/user');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage });

// Nodemailer setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Twilio setup
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Routes
app.get('/', (req, res) => {
    res.render('index', { error: null });
});

app.post('/send-otp', async (req, res) => {
    const { email, phone } = req.body;
    if (!email || !phone) return res.render('index', { error: 'Email and phone are required!' });
    if (!phone.startsWith('+')) return res.render('index', { error: 'Phone must start with country code (e.g., +91)!' });

    try {
        let user = await User.findOne({ email });
        if (!user) {
            user = new User({ email, phone });
        } else {
            user.phone = phone;
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.verificationToken = otp;
        await user.save();

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your OTP for Verification',
            html: `<h2>Your OTP</h2><p>Your OTP is: <strong>${otp}</strong></p><p>It expires in 15 minutes.</p>`
        };

        const smsMessage = `Your OTP is: ${otp}. Use it to verify your account.`;

        await Promise.all([
            transporter.sendMail(mailOptions),
            twilioClient.messages.create({
                body: smsMessage,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phone
            })
        ]);

        res.render('otp', { email, error: null });
    } catch (error) {
        console.error('OTP sending error:', error);
        res.render('index', { error: 'Failed to send OTP!' });
    }
});

app.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    try {
        const user = await User.findOne({ email, verificationToken: otp });
        if (!user) return res.render('otp', { email, error: 'Invalid OTP!' });

        user.isVerified = true;
        user.verificationToken = null;
        await user.save();

        res.redirect(`/application-form?email=${email}`);
    } catch (error) {
        console.error('OTP verification error:', error);
        res.render('otp', { email, error: 'Verification failed!' });
    }
});

app.get('/application-form', async (req, res) => {
    const { email } = req.query;
    const user = await User.findOne({ email });
    if (!user || !user.isVerified) return res.send('Email not verified!');
    res.render('application', { email, phone: user.phone, error: null });
});

app.post('/submit-form', upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'resume', maxCount: 1 }
]), async (req, res) => {
    const { name, email, phone } = req.body;
    const photo = req.files['photo'] ? req.files['photo'][0].filename : null;
    const resume = req.files['resume'] ? req.files['resume'][0].filename : null;

    try {
        const user = await User.findOne({ email });
        if (!user || !user.isVerified) return res.send('Email not verified!');
        user.name = name;
        user.phone = phone;
        user.photo = photo;
        user.resume = resume;
        await user.save();
        res.send('Application submitted successfully!');
    } catch (error) {
        console.error('Form submission error:', error);
        res.render('application', { email, phone, error: 'Failed to submit form!' });
    }
});

// Vercel serverless export
module.exports = app;