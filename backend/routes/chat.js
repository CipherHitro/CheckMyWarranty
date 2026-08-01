import express from "express";
import { handleChat } from "../controller/chat.js";

const router = express.Router();

// Disable caching for ALL chat responses — the answer depends on the
// question in the request body. Same URL + user token must always hit
// the server fresh; otherwise caches (Postman, browsers, proxies) will
// return the previous question's answer.
router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
});

// POST /api/chat — ask a question about your warranty documents
router.post("/", handleChat);

export default router;
