const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const { uploadToCloudinary } = require('../config/cloudinary');

// In-memory OTP store (dev only — use Redis/DB in production)
const otpStore = new Map();
const emailOtpStore = new Map();

// Helper to generate a 10-char alphanumeric ID (with retry for uniqueness)
const generateCrimzoId = async () => {
  for (let i = 0; i < 5; i++) {
    const id = Math.random().toString(36).substring(2, 12).toUpperCase().padEnd(10, '0');
    const existing = await User.findOne({ crimzo_id: id });
    if (!existing) return id;
  }
  // Fallback
  return ('C' + Date.now().toString(36).toUpperCase()).substring(0, 10).padEnd(10, '0');
};

// Email format validation
const isValidEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

function rejectIfBanned(user, res) {
  if (user?.is_banned) {
    res.status(403).json({ error: 'Your account has been suspended. Contact support.', banned: true });
    return true;
  }
  return false;
}

function formatAuthUser(user, extra = {}) {
  return {
    id: user.id,
    crimzo_id: user.crimzo_id,
    email: user.email,
    username: user.username,
    avatar: user.avatar,
    bio: user.bio,
    country: user.country,
    diamonds: user.diamonds ?? 0,
    beans: user.beans ?? 0,
    wallet_balance: user.wallet_balance ?? 0,
    followers_count: user.followers_count ?? 0,
    following_count: user.following_count ?? 0,
    friends_count: user.friends_count ?? 0,
    is_online: user.is_online,
    status: user.status,
    ...extra,
  };
}

// Nodemailer transporter (Gmail SMTP)
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });
};

// Guest Login
exports.guestLogin = async (req, res) => {
  try {
    const guestId = uuidv4().substring(0, 8);
    const guestUsername = `Guest_${guestId}`;
    const guestEmail = `guest_${guestId}@crimzo.guest`;
    const crimzoId = await generateCrimzoId();

    const user = await User.create({
      crimzo_id: crimzoId,
      email: guestEmail,
      password_hash: 'GUEST_NO_PASSWORD',
      username: guestUsername,
      diamonds: 100,
      beans: 0,
      country: 'India',
    });

    const token = jwt.sign(
      { id: user.id, email: guestEmail, username: guestUsername },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('Guest login success, ID:', user.id);
    res.json({
      success: true,
      token,
      user: formatAuthUser(user, {
        crimzo_id: crimzoId,
        email: guestEmail,
        username: guestUsername,
        avatar: null,
        bio: null,
        country: 'India',
        diamonds: 100,
        is_guest: true,
      }),
    });
  } catch (error) {
    console.error('Guest login error:', error);
    let msg = 'Guest login failed';
    if (error.message && (error.message.includes('buffering') || error.message.includes('ECONNREFUSED') || error.message.includes('Mongo'))) msg = 'Database unavailable. Backend may still be connecting to MongoDB.';
    res.status(500).json({ error: msg });
  }
};

// Send OTP
exports.sendOtp = (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || phone.length < 10) {
      return res.status(400).json({ error: 'Valid phone number required' });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

    console.log(`\n📱 OTP for +91${phone}: ${otp}\n`);
    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
};

// Verify OTP
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone and OTP required' });
    }

    const stored = otpStore.get(phone);
    if (!stored) {
      return res.status(400).json({ error: 'OTP not found. Please request a new one.' });
    }
    if (stored.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    }
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(phone);
      return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    }

    otpStore.delete(phone);

    const phoneEmail = `${phone}@phone.crimzo.local`;
    let user = await User.findOne({ email: phoneEmail });

    if (!user) {
      const username = `User_${phone.slice(-4)}`;
      const crimzoId = await generateCrimzoId();
      user = await User.create({
        crimzo_id: crimzoId,
        email: phoneEmail,
        password_hash: 'PHONE_AUTH_NO_PASSWORD',
        username,
        diamonds: 0,
        beans: 0,
        country: 'India',
      });
      console.log('New phone user created, ID:', user.id);
    } else {
      console.log('Existing phone user found, ID:', user.id);
    }

    if (rejectIfBanned(user, res)) return;


    await user.save();

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: formatAuthUser(user),
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    let msg = 'OTP verification failed';
    if (error.message && (error.message.includes('buffering') || error.message.includes('ECONNREFUSED') || error.message.includes('Mongo'))) msg = 'Database unavailable. Backend may still be connecting to MongoDB.';
    res.status(500).json({ error: msg });
  }
};

function decodeJwtPayload(idToken) {
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

async function verifyGoogleIdToken(idToken) {
  if (!idToken) return null;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    const data = await res.json();
    if (!res.ok || data?.error || !data?.email) {
      const decoded = decodeJwtPayload(idToken);
      if (decoded?.email && decoded?.email_verified !== false) {
        return {
          email: decoded.email,
          name: decoded.name,
          sub: decoded.sub,
          picture: decoded.picture,
        };
      }
      console.error('Google id_token verify failed:', data?.error || data);
      return null;
    }
    return data;
  } catch (err) {
    console.error('verifyGoogleIdToken error:', err);
    const decoded = decodeJwtPayload(idToken);
    if (decoded?.email && decoded?.email_verified !== false) {
      return {
        email: decoded.email,
        name: decoded.name,
        sub: decoded.sub,
        picture: decoded.picture,
      };
    }
    return null;
  }
}

// Google Login
exports.googleLogin = async (req, res) => {
  try {
    const { email, name, googleId, avatar, idToken } = req.body;

    let normalizedEmail = email ? email.trim().toLowerCase() : '';
    let resolvedName = name;
    let resolvedGoogleId = googleId;
    let resolvedAvatar = avatar;

    if (idToken) {
      const verified = await verifyGoogleIdToken(idToken);
      if (verified) {
        normalizedEmail = String(verified.email).trim().toLowerCase();
        resolvedName = verified.name || resolvedName;
        resolvedGoogleId = verified.sub || resolvedGoogleId;
        resolvedAvatar = verified.picture || resolvedAvatar;
      } else if (!normalizedEmail) {
        return res.status(401).json({ error: 'Invalid Google sign-in. Please try again.' });
      }
    }

    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required from Google' });
    }

    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      const username = resolvedName || `User_${uuidv4().substring(0, 6)}`;
      const crimzoId = await generateCrimzoId();
      user = await User.create({
        crimzo_id: crimzoId,
        email: normalizedEmail,
        password_hash: 'GOOGLE_AUTH_NO_PASSWORD',
        username,
        avatar: resolvedAvatar || null,
        diamonds: 0,
        beans: 0,
        country: 'India',
      });
      console.log('New Google user created, ID:', user.id);
    } else {
      if (resolvedAvatar && !user.avatar) {
        user.avatar = resolvedAvatar;
      }
      console.log('Existing Google user found, ID:', user.id);
    }

    if (rejectIfBanned(user, res)) return;


    await user.save();

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: formatAuthUser(user),
    });
  } catch (error) {
    console.error('Google login error:', error);
    let msg = 'Google login failed';
    if (error.message && (error.message.includes('buffering') || error.message.includes('ECONNREFUSED') || error.message.includes('Mongo'))) msg = 'Database unavailable. Backend may still be connecting to MongoDB.';
    res.status(500).json({ error: msg });
  }
};

// Register (supports optional avatar upload via multipart/form-data)
exports.register = async (req, res) => {
  try {
    const { email, password, username } = req.body;

    console.log('=== REGISTER ATTEMPT ===');
    console.log('Email:', email, 'Username:', username, 'Has avatar file:', !!req.file);

    if (!email || !password || !username) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address (e.g. user@gmail.com)' });
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const existingUsername = await User.findOne({ username: new RegExp('^' + username.trim() + '$', 'i') });
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Upload avatar to Cloudinary if provided (via multer in route)
    let avatarUrl = null;
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, 'avatars', 'image');
        avatarUrl = uploadResult.secure_url;
        console.log('Avatar uploaded to Cloudinary:', avatarUrl);
      } catch (cloudErr) {
        console.error('Cloudinary avatar upload error:', cloudErr.message);
        // Continue without avatar
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    console.log('Password hashed successfully, hash length:', passwordHash.length);

    const crimzoId = await generateCrimzoId();
    const user = await User.create({
      crimzo_id: crimzoId,
      email: normalizedEmail,
      password_hash: passwordHash,
      username: username.trim(),
      avatar: avatarUrl,
      diamonds: 0,
      beans: 0,
      country: 'India',
    });

    console.log('User registered successfully, ID:', user.id);

    const token = jwt.sign(
      { id: user.id, email: normalizedEmail, username: username.trim() },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: formatAuthUser(user, {
        crimzo_id: crimzoId,
        email: normalizedEmail,
        username: username.trim(),
        avatar: avatarUrl,
        bio: null,
        country: 'India',
      }),
    });
  } catch (error) {
    console.error('Register error:', error);
    let msg = error.message || 'Registration failed';
    if (msg.includes('buffering timed out') || msg.includes('ECONNREFUSED') || msg.includes('querySrv') || msg.includes('MongoNetwork') || msg.includes('ENOTFOUND')) {
      msg = 'Cannot connect to database. Make sure the backend is fully connected to MongoDB (see logs). If using Atlas, check internet/DNS/IP whitelist. Try again in a few seconds.';
    }
    res.status(500).json({ error: msg });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('=== LOGIN ATTEMPT ===');
    console.log('Email:', email);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address (e.g. user@gmail.com)' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    console.log('Users found:', user ? 1 : 0);

    if (!user) {
      console.log('No user found with email:', normalizedEmail);
      return res.status(401).json({ error: 'No account found with this email. Please register first.' });
    }

    console.log('User found:', { id: user.id, email: user.email, username: user.username, hasPasswordHash: !!user.password_hash });

    if (!user.password_hash) {
      console.log('User has no password_hash! User ID:', user.id);
      return res.status(401).json({ error: 'Account setup incomplete. Please register again with this email.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    console.log('Password valid:', validPassword);

    if (!validPassword) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    if (user.is_banned) {
      return res.status(403).json({ error: 'Your account has been suspended. Contact support.', banned: true });
    }



    // Auto-generate crimzo_id if missing
    if (!user.crimzo_id) {
      const newCrimzoId = await generateCrimzoId();
      user.crimzo_id = newCrimzoId;
    }
    await user.save();

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log('Login successful for user:', user.id);

    res.json({
      success: true,
      token,
      user: formatAuthUser(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    let msg = error.message || 'Login failed';
    if (msg.includes('buffering timed out') || msg.includes('ECONNREFUSED') || msg.includes('querySrv') || msg.includes('MongoNetwork') || msg.includes('ENOTFOUND')) {
      msg = 'Cannot connect to database. Make sure the backend is fully connected to MongoDB (see logs). Try again in a few seconds.';
    }
    res.status(500).json({ error: msg });
  }
};

// ── Email OTP: Send ──
exports.sendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isValidEmail(email.trim().toLowerCase())) {
      return res.status(400).json({ error: 'Please enter a valid email address (e.g. user@gmail.com)' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    emailOtpStore.set(normalizedEmail, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });

    console.log(`\n📧 Email OTP for ${normalizedEmail}: ${otp}\n`);

    // Send via Gmail SMTP if configured
    if (process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD) {
      try {
        const transporter = createTransporter();
        await transporter.sendMail({
          from: `"Crimzo" <${process.env.SMTP_EMAIL}>`,
          to: normalizedEmail,
          subject: 'Your Crimzo Verification Code',
          html: `
            <div style="background:#0a0a0f;padding:40px;font-family:sans-serif;border-radius:16px;max-width:500px;margin:auto">
              <h1 style="color:#FF2D55;font-size:32px;letter-spacing:4px;margin:0 0 8px">CRIMZO</h1>
              <p style="color:#aaa;margin:0 0 32px;font-size:13px;letter-spacing:2px">VERIFICATION CODE</p>
              <div style="background:#1a1a2e;border:1px solid rgba(255,45,85,0.3);border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
                <p style="color:#fff;font-size:42px;font-weight:900;letter-spacing:12px;margin:0">${otp}</p>
              </div>
              <p style="color:#888;font-size:13px;line-height:1.6">
                This code expires in <strong style="color:#fff">10 minutes</strong>.<br/>
                If you didn't request this, please ignore this email.
              </p>
            </div>
          `,
        });
        console.log('Email OTP sent successfully to:', normalizedEmail);
      } catch (emailErr) {
        console.error('Email send error:', emailErr.message);
        // Still return success — OTP is in memory for dev testing
      }
    }

    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (error) {
    console.error('Send email OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
};

// ── Email OTP: Verify ──
exports.verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const stored = emailOtpStore.get(normalizedEmail);
    if (!stored) {
      return res.status(400).json({ error: 'OTP not found. Please request a new one.' });
    }
    if (stored.otp !== otp.toString()) {
      return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    }
    if (Date.now() > stored.expiresAt) {
      emailOtpStore.delete(normalizedEmail);
      return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    }

    // Keep OTP in store as "verified" so the next step can complete registration
    emailOtpStore.set(normalizedEmail, { ...stored, verified: true });

    // Check if user already exists
    const user = await User.findOne({ email: normalizedEmail }).select('id crimzo_id email username avatar bio country diamonds beans followers_count following_count friends_count');

    if (user) {
      // Existing user — log them in
      emailOtpStore.delete(normalizedEmail);

      if (rejectIfBanned(user, res)) return;

      const token = jwt.sign(
        { id: user.id, email: user.email, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      return res.json({
        success: true,
        isNewUser: false,
        token,
        user: formatAuthUser(user),
      });
    }

    // New user — needs to set username + password
    res.json({ success: true, isNewUser: true, email: normalizedEmail });
  } catch (error) {
    console.error('Verify email OTP error:', error);
    res.status(500).json({ error: 'OTP verification failed' });
  }
};

// ── Email OTP: Complete Registration (new user) ──
exports.completeEmailRegistration = async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Ensure OTP was verified
    const stored = emailOtpStore.get(normalizedEmail);
    if (!stored || !stored.verified) {
      return res.status(400).json({ error: 'Email not verified. Please verify OTP first.' });
    }
    emailOtpStore.delete(normalizedEmail);

    // Check username availability
    const existingUsername = await User.findOne({ username: new RegExp('^' + username.trim() + '$', 'i') });
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already taken. Please choose another.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const crimzoId = await generateCrimzoId();

    const user = await User.create({
      crimzo_id: crimzoId,
      email: normalizedEmail,
      password_hash: passwordHash,
      username: username.trim(),
      diamonds: 0,
      beans: 0,
      country: 'India',
    });
    const token = jwt.sign(
      { id: user.id, email: normalizedEmail, username: username.trim() },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log('New email user registered, ID:', user.id);

    res.json({
      success: true,
      token,
      user: formatAuthUser(user, {
        crimzo_id: crimzoId,
        email: normalizedEmail,
        username: username.trim(),
        avatar: null,
        bio: null,
        country: 'India',
      }),
    });
  } catch (error) {
    console.error('Complete email registration error:', error);
    let msg = 'Registration failed';
    if (error.message && (error.message.includes('buffering') || error.message.includes('ECONNREFUSED') || error.message.includes('Mongo'))) msg = 'Database unavailable. Backend may still be connecting to MongoDB.';
    res.status(500).json({ error: msg });
  }
};

// Get current user
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.is_banned) {
      return res.status(403).json({ error: 'Your account has been suspended.', banned: true });
    }

    // Auto-generate crimzo_id for existing users who don't have one
    if (!user.crimzo_id) {
      const newCrimzoId = await generateCrimzoId();
      user.crimzo_id = newCrimzoId;
      await user.save();
    }

    res.json({
      id: user.id, crimzo_id: user.crimzo_id, email: user.email, username: user.username,
      avatar: user.avatar, bio: user.bio, country: user.country,
      diamonds: user.diamonds, beans: user.beans,
      wallet_balance: user.wallet_balance || 0,
      followers_count: user.followers_count,
      following_count: user.following_count,
      friends_count: user.friends_count,
      is_online: user.is_online,
      status: user.status
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};
