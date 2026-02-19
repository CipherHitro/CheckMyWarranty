const pool = require("../connection");
const bcrypt = require("bcryptjs");
const { setUser } = require("../services/auth");
require('dotenv').config();

async function handleSignUp(req, res) {
  try {
    const { email, password } = req.body;
    console.log("In handle sign up")
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "Invalid Credential" });
    }

    // Hash the password
    const salt = bcrypt.genSaltSync(10);
    const passHash = bcrypt.hashSync(password, salt);

    // Insert the new user
    const newUser = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, passHash]
    );

    return res.status(201).json({ message: "User registered successfully", user: { id: newUser.rows[0].id, email: newUser.rows[0].email } });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

async function handleLogin(req, res) {
  try {
    const { email, password } = req.body;
    console.log("In handle log up")

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Check if user exists
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = result.rows[0];

    // Compare password
    const isMatch = bcrypt.compareSync(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate token
    const token = setUser(user);

    if (process.env.mode == "development") {
      return res.status(200).json({ message: "Logged in!", token });
    } else {
      console.log("In production");
      res.cookie("uid", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
        maxAge: 24 * 60 * 60 * 1000,
      });
      return res.status(200).json({ message: "Logged in!" });
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

module.exports = {
  handleLogin,
  handleSignUp,
};
