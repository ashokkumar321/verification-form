const express = require('express');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const User = require('./models/user');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// 🔹 Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ✅ Use Only Cloudinary Storage
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'uploads',
        format: async (req, file) => file.mimetype.split('/')[1], 
        public_id: (req, file) => `${Date.now()}-${file.originalname}`
    }
});

// ✅ Use Multer with Cloudinary
const upload = multer({ storage });


// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// Nodemailer setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Routes
app.get('/', (req, res) => {
    res.render('index', { error: null });
});

app.post('/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.render('index', { error: 'Email is required!' });

    try {
        let user = await User.findOne({ email });
        if (!user) {
            user = new User({ email });
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

        await transporter.sendMail(mailOptions);

        res.render('otp', { email, error: null });
    } catch (error) {
        console.error('OTP sending error:', error);
        res.render('index', { error: 'Failed to send OTP!' });
    }
});

app.get('/otp', (req, res) => {
    const { email } = req.query;
    if (!email) return res.redirect('/');
    res.render('otp', { email, error: null });
});

app.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    try {
        const user = await User.findOne({ email, verificationToken: otp });
        if (!user) return res.render('otp', { email, error: 'Invalid OTP!' });

        user.isVerified = true;
        user.verificationToken = null;
        await user.save();

        console.log(`User ${email} verified successfully!`);
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
    
    // Ensure error is always defined
    res.render('application', { name: user.name || '', email, phone: user.phone || '', error: '' });
});


app.post('/submit-application', upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'resume', maxCount: 1 }
]), async (req, res) => {
    const { email, name } = req.body;
    const photo = req.files['photo'] ? req.files['photo'][0].path : null;
    const resume = req.files['resume'] ? req.files['resume'][0].path : null;

    try {
        const user = await User.findOne({ email });
        if (!user || !user.isVerified) return res.send('Email not verified!');

        user.name = name;
        user.photo = photo;
        user.resume = resume;
        await user.save();

        res.render('success');
    } catch (error) {
        console.error('Application submission error:', error);
        res.render('application', { name, email, phone: user.phone, error: 'Failed to submit application!' });
    }
});



// Start server locally
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Vercel serverless export
module.exports = app;
