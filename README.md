# 📋 CheckMyWarranty

A full-stack, production-ready web application to track and manage product warranties. Upload receipts or invoices (PDFs and images), let AI extract the warranty details automatically, chat with your documents using a RAG pipeline, and get email reminders before warranties expire — all in real time.

🚀 **Live Demo:** [checkmywarranty.vercel.app](https://checkmywarranty.vercel.app/)

🔑 **Demo Credentials:** `demo@gmail.com` / `Demo@123`

---

## ✨ What It Does

| Feature | How |
|---|---|
| 📄 **AI Document Extraction** | Uploads trigger Groq LLM to auto-extract item name, purchase date & expiry date. Text PDFs use `Llama 3.1 8B`; scanned docs & images use `Llama 4 Scout 17B` (vision). |
| 🤖 **RAG Document Chat** | Ask natural-language questions about any uploaded warranty. Documents are chunked & embedded via **Cohere `embed-v4.0`** (1024-dim vectors) stored in **pgvector**. At query time, cosine similarity retrieves the most relevant context, then **Groq** generates a grounded, date-aware answer. |
| ⏰ **Smart Email Reminders** | Automatically schedules reminder emails at 7 days and 3 days before a warranty expires, delivered via **Brevo**. |
| ⚡ **Real-Time Updates (SSE)** | Document processing status is streamed to the browser instantly via **Server-Sent Events** — no polling. |
| 🔐 **Secure Auth** | Dual-token JWT (Access + Refresh) with httpOnly cookies, OTP-based password reset via Redis, and **rate-limited login** (5 attempts / 15 min per IP+email). |
| 🚀 **Redis Caching** | Document lists and S3 pre-signed URLs are served from Redis cache — database is hit only on a cache miss. |
| ☁️ **Cloud Storage** | Files stored in **AWS S3** with time-bound signed URLs for secure access in production. |

---

## 🏗️ Architecture

```
  ┌──────────────────────────────────┐
  │   React 19 + Tailwind (Frontend) │
  └──────────────┬───────────────────┘
                 │ REST API / SSE
                 ▼
  ┌──────────────────────────────────┐
  │     Nginx (Reverse Proxy)        │
  │  SSL Termination · SSE Buffering │
  └──────────────┬───────────────────┘
                 │
                 ▼
  ┌──────────────────────────────────────────────────────┐
  │              Node.js + Express 5  (AWS EC2)          │
  │                                                      │
  │  JWT Auth · Rate Limiter · Prisma ORM · SSE · Pino  │
  │                                                      │
  │  BullMQ Workers (3 independent queues):              │
  │  ┌─────────────────┐  ┌──────────────────┐          │
  │  │ extractionWorker│  │ embeddingWorker  │          │
  │  │  → Groq AI      │  │  → Cohere API    │          │
  │  └─────────────────┘  └──────────────────┘          │
  │  ┌─────────────────┐                                 │
  │  │ reminderWorker  │                                 │
  │  │  → Brevo Email  │                                 │
  │  └─────────────────┘                                 │
  └──────┬──────────┬──────────┬──────────┬─────────────┘
         │          │          │          │
         ▼          ▼          ▼          ▼
   PostgreSQL    Redis      AWS S3    Groq / Cohere
   + pgvector   (Cache,    (Files)   (AI Services)
   (AWS RDS)    BullMQ,
                RateLimiter)
```

---

## 🔄 How Document Processing Works

When you upload a file, two background jobs run **in parallel and independently**:

1. **Extraction Worker** → Groq AI reads the document, extracts the expiry date & item name, saves it to the database, and schedules email reminders.
2. **Embedding Worker** → The document is chunked and embedded via Cohere (`embed-v4.0`). Vectors are stored in PostgreSQL (`pgvector`) so you can later chat with the document. Images and scanned PDFs are handled via Cohere's image embedding API directly.

Both workers report progress back to your browser in real time via SSE.

---

## 💻 Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| **React 19** | UI Framework |
| **React Router v7** | Client-Side Routing |
| **Tailwind CSS v4** | Styling |
| **Vite 7** | Dev Server & Bundler |

### Backend
| Technology | Purpose |
|---|---|
| **Express 5** | HTTP Server |
| **Prisma ORM** | Database Client & Migrations |
| **PostgreSQL + pgvector** | Relational DB with Vector Search |
| **Redis** | Caching, Rate Limiting & BullMQ Backbone |
| **BullMQ** | Background Job Queues & Workers |
| **Groq AI** | Expiry Extraction (Llama 3.1 & 4 Scout) + RAG Answers |
| **Cohere** | Vector Embeddings (`embed-v4.0`, 1024-dim) |
| **AWS S3** | File Storage with Pre-signed URLs |
| **Brevo** | Transactional Emails (Reminders & OTP) |
| **Pino + Pino-Loki** | Structured Logging → Grafana Cloud |

### Infrastructure
| Technology | Purpose |
|---|---|
| **Docker & Docker Compose** | Containerized Dev & Production Setup |
| **AWS EC2** | Production Hosting |
| **Nginx** | Reverse Proxy & SSE Buffer Management |
| **GitHub Actions** | Automated CI/CD via SSH |
| **Grafana Cloud** | Log Aggregation & Dashboards |

---

## 📁 Project Structure

```
CheckMyWarranty/
├── .github/workflows/    # GitHub Actions CI/CD pipeline
├── backend/
│   ├── config/           # Redis client & SSE registry
│   ├── controller/       # Route handlers (auth, data, RAG chat)
│   ├── grafana/          # Grafana/Loki provisioning config
│   ├── middlewares/      # JWT auth & Redis-backed rate limiter
│   ├── migrations/       # Database migration files
│   ├── prisma/           # Prisma schema (includes pgvector document_chunks)
│   ├── queues/           # BullMQ queue definitions (reminder, extraction, embedding)
│   ├── routes/           # Express routers (/api/user, /api/data, /api/chat)
│   ├── services/         # Business logic (embedding, search, chat, extraction, email)
│   ├── workers/          # BullMQ workers (reminder, extraction, embedding)
│   ├── utils/            # Shared utilities
│   ├── index.js          # Express app entry point
│   ├── docker-compose.yml
│   └── docker-compose.prod.yml
├── frontend/             # React 19 + Tailwind CSS frontend
└── README.md
```

---

## 🚀 Running Locally

### Prerequisites
- **Node.js** v20+
- **Docker & Docker Compose**
- API keys for **Groq**, **Cohere**, and **Brevo**

### Steps

```bash
# 1. Clone
git clone https://github.com/CipherHitro/CheckMyWarranty.git
cd CheckMyWarranty

# 2. Configure environment
cp backend/.env.production backend/.env
# Fill in your GROQ_API, COHERE_API_KEY, BREVO_API, etc.

# 3. Start containers (PostgreSQL + pgvector, Redis, Loki, Grafana)
cd backend
docker compose up -d

# 4. Run database migrations
npx prisma migrate dev

# 5. Start frontend
cd ../frontend
npm install && npm run dev
```

### Local Services
| Service | URL |
|---|---|
| Frontend | `http://localhost:5173` |
| Backend API | `http://localhost:3000` |
| Bull Board (Queue Monitor) | `http://localhost:3000/admin/queues` |
| Grafana (Logs) | `http://localhost:3001` |
| RedisInsight | `http://localhost:5540` |

---

## ☁️ Production Deployment

The app is deployed on **AWS EC2** using Docker. On every push to `main`, GitHub Actions:

1. SSHes into the EC2 instance
2. Pulls the latest code and injects secrets from GitHub Repository Secrets into `.env`
3. Builds and starts updated Docker containers (`docker-compose.prod.yml`)
4. Runs Prisma migrations
5. Prunes old Docker images

Production drops the local Loki/Grafana containers to save EC2 memory and instead ships logs directly to **Grafana Cloud** via `pino-loki`.

---

## 📄 License

This project is licensed under the **ISC License**.

---

## 👤 Author

**Rohit Rathod** — [GitHub Profile](https://github.com/CipherHitro)
