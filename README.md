# 📋 CheckMyWarranty

A full-stack, enterprise-grade web application designed to track and manage product warranty documents. Upload warranty receipts or invoices (PDFs and images), automatically extract warranty details and expiry dates using **Groq AI LLMs**, chat with your documents using a **RAG pipeline** powered by **Cohere embeddings** and **pgvector**, receive automated email reminders prior to expiration, and stream real-time updates via **Server-Sent Events (SSE)**.

🚀 **Live Demo:** [checkmywarranty.vercel.app](https://checkmywarranty.vercel.app/)

🔑 **Demo Credentials:**
- **Email:** `demo@gmail.com`
- **Password:** `Demo@123`

---

## ✨ Features

- **🔐 Dual-Token Authentication & Security** — Access Token & Refresh Token authentication pattern with httpOnly cookie handling, password hashing via bcryptjs, and complete session management.
- **🛡️ Auth Rate Limiting** — Login endpoint is protected by `rate-limiter-flexible` backed by Redis. Limits each IP+email combination to **5 attempts per 15 minutes**, blocking further attempts for 15 minutes and returning a `429` with a `Retry-After` header.
- **🔑 Password Reset Flow** — Forgot Password feature utilizing time-limited OTP verification and secure reset tokens managed in **Redis**.
- **📄 AI-Powered Document Processing** — Auto-extracts purchase date, item name, and warranty expiry date from uploaded files using **Groq LLMs**:
  - **Text PDFs:** Analyzed using `Llama 3.1 8B Instant`.
  - **Scanned/Image PDFs & Images:** Analyzed using `Llama 4 Scout 17B` (Vision model).
- **🤖 RAG Document Chat (pgvector + Cohere + Groq)** — Ask natural-language questions about any of your uploaded warranty documents. The full pipeline:
  1. At upload time, documents are chunked and embedded via **Cohere `embed-v4.0`** (1024-dim vectors) and stored in a **pgvector**-enabled PostgreSQL table (`document_chunks`).
  2. Images and scanned PDFs are embedded directly as **image embeddings** using Cohere's multimodal API.
  3. At query time, the user's question is embedded with the `search_query` input type, then a **cosine similarity search** (with per-document windowed ranking) retrieves the most relevant chunks.
  4. Retrieved context is sent to **Groq `llama-3.1-8b-instant`** to generate a grounded, date-aware answer.
- **⚡ Real-Time Server-Sent Events (SSE)** — Replaced HTTP polling with a real-time SSE stream (`/api/data/events`) for instantaneous document processing updates. Includes keep-alive pings and Nginx buffering bypass (`X-Accel-Buffering: no`).
- **🚀 High-Performance Caching Layer (Redis)** — Multi-layer caching for document metadata and pre-signed AWS S3 URLs. Checks Redis cache first; if cache hit, serves instantly; if cache miss, queries database/S3 and populates Redis cache.
- **☁️ AWS S3 Cloud Storage** — Secure cloud file storage utilizing AWS S3 with time-bound signed URLs (`@aws-sdk/s3-request-presigner`) for secure document viewing in production, and local disk storage in development.
- **🗄️ Relational Database with Prisma ORM** — **Prisma ORM** interacting with **AWS RDS PostgreSQL** in production and containerized PostgreSQL in development. Schema includes `document_chunks` table with a `vector(1024)` column for pgvector similarity search.
- **⏰ Distributed Queues & Separated Background Workers** — **BullMQ** backed by Redis with **three independent queues and workers**:
  - **`reminder-queue` + `reminderWorker`** — Schedules warranty expiry email notifications (7 days and 3 days before expiry).
  - **`document-extraction` + `extractionWorker`** — Calls Groq AI to extract expiry dates and creates reminder jobs. Runs independently of embeddings.
  - **`document-embedding` + `embeddingWorker`** — Calls Cohere to generate vector embeddings for RAG. Runs independently of extraction.
  - All workers use concurrency: 1 and exponential backoff (3 retries: 10s → 20s → 40s).
- **🔄 Job Recovery on Restart** — On startup, `jobRecoveryService` re-queues any `pending` reminder jobs that were lost if Redis went down, guaranteeing zero missed email notifications.
- **📊 Bull Board Monitoring Dashboard** — Integrated `@bull-board/express` dashboard protected by HTTP Basic Auth available at `/admin/queues` for monitoring all three background job queues (reminders, extraction, embedding).
- **📧 Transactional Emails** — Styled HTML reminder and OTP emails delivered via **Brevo API** (formerly Sendinblue).
- **📈 Observability & Logging (Pino + Loki + Grafana)** — Structured JSON logging with `pino` and `pino-loki`. Ships logs to local **Loki** & pre-configured **Grafana** (`http://localhost:3001`) during development, and streams directly to **Grafana Cloud** in production to minimize EC2 memory overhead.
- **🐳 Containerized Architecture & CI/CD** — Fully containerized backend using Docker & Docker Compose. Automated CI/CD pipeline via **GitHub Actions** deploying to **AWS EC2** behind an **Nginx** reverse proxy.

---

## 🏗️ Architecture & System Design

```
+-----------------------------------------------------------------------------------+
|                                    FRONTEND                                       |
|                            React 19 + Tailwind CSS                                |
+-----------------------------------------------------------------------------------+
                                         |
                                (REST API / SSE)
                                         v
+-----------------------------------------------------------------------------------+
|                             NGINX REVERSE PROXY                                   |
|                        (SSL Termination & SSE Buffering Off)                      |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                        AWS EC2 (DOCKER CONTAINER)                                 |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                       Node.js + Express 5 Backend                           |  |
|  |                                                                             |  |
|  |  +-------------------+   +--------------------+   +---------------------+  |  |
|  |  |  JWT Auth + OTP   |   |  Pino JSON Logger  |   |  Prisma Client ORM  |  |  |
|  |  |  Rate Limiter     |   +--------------------+   +---------------------+  |  |
|  |  +-------------------+                                                     |  |
|  |                                                                             |  |
|  |  BullMQ Queues & Workers:                                                  |  |
|  |  ┌─────────────────────┐ ┌──────────────────────┐ ┌──────────────────┐   |  |
|  |  │  document-extraction │ │  document-embedding  │ │  reminder-queue  │   |  |
|  |  │  extractionWorker    │ │  embeddingWorker     │ │  reminderWorker  │   |  |
|  |  │  (Groq AI)           │ │  (Cohere embed-v4.0) │ │  (Brevo Email)   │   |  |
|  |  └─────────────────────┘ └──────────────────────┘ └──────────────────┘   |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
        |                 |                   |                 |           |
        v                 v                   v                 v           v
 +-------------+   +--------------+   +---------------+   +----------+ +----------+
 |  AWS RDS    |   | Redis Cache  |   | AWS S3 Bucket |   | Groq AI  | | Cohere   |
 | PostgreSQL  |   | & BullMQ     |   | (Signed URLs) |   | (Llama)  | | embed-v4 |
 | + pgvector  |   +--------------+   +---------------+   +----------+ +----------+
 +-------------+          |                                     |
                           v                                     v
                    +--------------+                      +---------------+
                    | Bull Board   |                      | Grafana Cloud |
                    | (/admin/q)   |                      | (Pino-Loki)   |
                    +--------------+                      +---------------+
```

---

## 💻 Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| **React 19** | UI Component Framework |
| **React Router v7** | Single-Page Application Client-Side Routing |
| **Tailwind CSS v4** | Utility-First Responsive Styling |
| **Vite 7** | Development Server & Production Bundler |
| **Lucide React** | Modern Icon Library |
| **React Hot Toast** | Real-Time Toast Notifications |

### Backend & Core Services
| Technology | Purpose |
|---|---|
| **Express 5** | RESTful HTTP Server & Middleware Engine |
| **Prisma ORM** | Type-Safe Database Client & Schema Management |
| **PostgreSQL + pgvector (AWS RDS)** | Production Relational Database with Vector Similarity Search |
| **Redis & ioredis** | High-Speed Cache, Rate Limiting Store & BullMQ Backbone |
| **BullMQ & @bull-board** | Multi-Queue Background Workers & Admin Dashboard |
| **rate-limiter-flexible** | Redis-backed Auth Rate Limiting (5 attempts / 15 min) |
| **AWS SDK v3 (S3)** | Object Storage & Pre-signed URL Generator |
| **Groq AI SDK** | Vision & Text Document Extraction (Llama 3.1 & 4 Scout) + RAG Answering |
| **Cohere AI SDK (`cohere-ai`)** | 1024-dim Vector Embeddings for RAG (`embed-v4.0`) |
| **Pino & Pino-Loki** | High-Performance Logging & Grafana Loki Shipper |
| **Brevo (@getbrevo/brevo)** | Transactional Reminder & OTP Email Service |
| **Server-Sent Events (SSE)** | Low-Latency Real-Time Server-to-Client Event Streaming |

### Infrastructure, DevOps & Monitoring
| Technology | Purpose |
|---|---|
| **Docker & Docker Compose** | Multi-Container Orchestration (App, Redis, PostgreSQL, Loki, Grafana) |
| **AWS EC2 (Free Tier)** | Production Host Server |
| **Nginx** | Reverse Proxy, SSL Termination, & SSE Buffer Management |
| **GitHub Actions** | Automated CI/CD Deployment Pipeline via SSH |
| **Grafana & Grafana Cloud** | Log Aggregation, Querying, & Visual Dashboards |

---

## 📁 Project Structure

```
CheckMyWarranty/
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Actions CI/CD deployment pipeline
│
├── backend/
│   ├── config/
│   │   ├── redis.js              # Redis client connection configuration
│   │   └── sse.js                # Server-Sent Events client registry & dispatcher
│   ├── controller/
│   │   ├── chat.js               # RAG chat controller — handles /api/chat
│   │   ├── manageData.js         # Upload, delete, and cached fetch controllers
│   │   └── user.js               # Auth, Refresh Tokens, and Password Reset (OTP)
│   ├── grafana/
│   │   └── provisioning/
│   │       └── datasources/
│   │           └── loki-datasource.yml # Auto-configured Grafana Loki datasource
│   ├── middlewares/
│   │   ├── auth.js               # Access Token & Bull Board Auth middlewares
│   │   └── rateLimiter.js        # Redis-backed auth rate limiter (rate-limiter-flexible)
│   ├── prisma/
│   │   └── schema.prisma         # Prisma ORM Schema (includes document_chunks + vector)
│   ├── queues/
│   │   ├── documentQueue.js      # BullMQ queues: document-extraction & document-embedding
│   │   └── reminderQueue.js      # BullMQ queue declaration for reminder jobs
│   ├── routes/
│   │   ├── chat.js               # RAG chat route (/api/chat)
│   │   ├── manageData.js         # Document management & SSE endpoint (/api/data)
│   │   └── user.js               # Auth & Password Reset routes (/api/user)
│   ├── services/
│   │   ├── auth.js               # Access/Refresh JWT sign & verify helpers
│   │   ├── brevoEmailService.js  # Brevo email delivery service
│   │   ├── chatService.js        # RAG pipeline: retrieve chunks → build context → Groq answer
│   │   ├── documentChunkService.js # Text chunking + Cohere embedding + pgvector storage
│   │   ├── embeddingService.js   # Cohere embed-v4.0 API wrapper (text & image embeddings)
│   │   ├── extractWarranty.js    # Groq AI document extraction service
│   │   ├── jobRecoveryService.js # Re-queues pending reminder jobs on server restart
│   │   ├── otpService.js         # OTP generation & Redis verification helpers
│   │   ├── reminderService.js    # Creates reminder records & schedules email jobs
│   │   ├── s3Storage.js          # AWS S3 upload, delete, and pre-signed URL helpers
│   │   ├── searchService.js      # pgvector cosine similarity search with per-doc windowing
│   │   └── tokenService.js       # Token generation helpers
│   ├── workers/
│   │   ├── embeddingWorker.js    # BullMQ worker: Cohere embeddings → document_chunks table
│   │   ├── extractionWorker.js   # BullMQ worker: Groq extraction → expiry date + reminders
│   │   └── reminderWorker.js     # BullMQ worker: sends warranty reminder emails via Brevo
│   ├── connection.js             # Prisma Client instance
│   ├── docker-compose.yml        # Development environment Docker Compose
│   ├── docker-compose.prod.yml   # Production environment Docker Compose
│   ├── Dockerfile                # Production multi-stage Docker build file
│   ├── index.js                  # Express app entry point
│   ├── logger.js                 # Pino logger with pino-loki transport
│   ├── package.json
│   ├── .env                      # Local development environment variables
│   └── .env.production           # Production environment variable template
│
├── frontend/                     # React 19 + Tailwind CSS frontend application
└── README.md
```

---

## 🔌 API Endpoints Reference

### Authentication & Password Reset (`/api/user`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/user/signup` | Register a new user account | ❌ No |
| `POST` | `/api/user/login` | Authenticate user & issue Access/Refresh tokens (**Rate limited: 5 req / 15 min**) | ❌ No |
| `POST` | `/api/user/refresh` | Issue new Access Token using valid Refresh Token | ❌ No |
| `GET` | `/api/user/me` | Fetch authenticated user profile details | ✅ Yes |
| `POST` | `/api/user/forgot-password` | Send OTP email for password reset | ❌ No |
| `POST` | `/api/user/verify-otp` | Verify 6-digit OTP & receive reset token | ❌ No |
| `POST` | `/api/user/reset-password` | Update password using reset token | ❌ No |
| `POST` | `/api/user/logout` | Revoke session & clear cookies | ✅ Yes |

### Document Management & Real-Time Events (`/api/data`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/data/upload` | Upload warranty document (multipart/form-data) — triggers extraction & embedding jobs | ✅ Yes |
| `GET` | `/api/data/getAll` | Retrieve all documents for user (Served via Redis cache) | ✅ Yes |
| `GET` | `/api/data/getOne/:documentId` | Fetch single document details with S3 pre-signed URL | ✅ Yes |
| `DELETE` | `/api/data/remove` | Delete document from database & S3 storage | ✅ Yes |
| `GET` | `/api/data/events` | **Server-Sent Events (SSE)** endpoint for processing status | ✅ Yes |

### RAG Document Chat (`/api/chat`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/chat` | Ask a natural-language question about your uploaded warranty documents | ✅ Yes |

**Request body:**
```json
{ "question": "Is my iPhone 15 Pro still under warranty?" }
```

**Response:**
```json
{
  "answer": "Based on your uploaded document...",
  "sources": [
    { "document_id": 42, "original_filename": "iphone_receipt.pdf", "similarity": 0.87, "content": "..." }
  ]
}
```

### Monitoring & Operations
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/health` | Application & Database connectivity check | ❌ No |
| `GET` | `/admin/queues` | **Bull Board UI** for all three background queues | 🔐 Basic Auth |

---

## 🤖 RAG Pipeline — How It Works

When a document is uploaded, two independent BullMQ jobs are dispatched in parallel:

```
Upload Request
      │
      ├──► document-extraction queue ──► extractionWorker
      │          │ Groq AI extracts expiry date
      │          │ Updates document.expiry_date
      │          └─ Schedules email reminders
      │
      └──► document-embedding queue ──► embeddingWorker
                 │ Determines document type:
                 │   Image → Cohere image embedding (1 vector)
                 │   Text PDF → chunk text → Cohere text embeddings (N vectors)
                 │   Scanned PDF → render page → Cohere image embedding (1 vector)
                 │ Stores vectors in document_chunks (pgvector)
                 └─ Updates document.rag_status = "ready"
```

When the user asks a question via `/api/chat`:

```
User Question
      │
      ▼
Cohere embed-v4.0 (inputType: "search_query")
      │ query vector
      ▼
pgvector cosine similarity search
  - Per-document windowed ranking
  - Filters by similarity threshold (≥ 0.3)
  - Returns top 3 chunks × top 3 documents
      │ retrieved context
      ▼
Groq llama-3.1-8b-instant
  - System prompt with today's date + retrieved context
  - Grounded, date-aware answer
      │
      ▼
{ answer, sources[] }
```

---

## ⚡ Redis & Caching Strategy

The backend leverages Redis for four distinct operational roles:

1. **Document & S3 URL Caching:**
   - Requests to `/api/data/getAll` check Redis key `documents:<user_id>`.
   - Pre-signed S3 URLs are cached with expiration matching the URL validity to eliminate redundant S3 signing overhead.
   - Cache invalidation occurs automatically whenever a new file is uploaded or deleted.
2. **Session Security & Password Resets:**
   - OTP codes are stored with a strict **5-minute expiration window**.
   - OTP verification issues a short-lived **reset token** stored in Redis with 10-minute expiration to prevent unauthorized password updates.
3. **Auth Rate Limiting:**
   - `rate-limiter-flexible` uses Redis to track login attempts per IP+email key.
   - After 5 failed attempts within 15 minutes, the key is blocked for 15 minutes. The response includes a `Retry-After` header.
4. **Queue Backbone (BullMQ):**
   - Stores extraction, embedding, and reminder jobs persistently in Redis data structures.
   - Guarantees zero job loss even if the Node.js app container restarts.

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)

```env
# Server Mode & Port
mode=development # or "production"
LOG_LEVEL=info

# PostgreSQL (Prisma) — must have pgvector extension enabled
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/checkmywarranty?schema=public

# JWT Authentication
ACCESS_TOKEN_SECRET=your_access_token_secret
REFRESH_TOKEN_SECRET=your_refresh_token_secret
secret=your_legacy_secret

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
BULL_BOARD_PASSWORD=your_admin_dashboard_password

# Groq AI Service (document extraction + RAG answering)
GROQ_API=your_groq_api_key

# Cohere AI Service (vector embeddings for RAG)
COHERE_API_KEY=your_cohere_api_key

# Brevo Email Service
BREVO_API=your_brevo_api_key
BREVO_SENDER_EMAIL=team@checkmywarranty.mentalorbit.tech
BREVO_SENDER_NAME=CheckMyWarranty

# AWS S3 Storage (Production)
AWS_REGION=ap-south-1
AWS_S3_BUCKET=your_s3_bucket_name
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key

# Loki & Grafana Logging
LOKI_HOST=http://127.0.0.1:3100
# LOKI_AUTH_USER=
# LOKI_AUTH_PASSWORD=

# Frontend Origin (CORS)
FRONTEND_URL=http://localhost:5173
```

---

## 🚀 Local Development Setup (Using Docker)

### Prerequisites

- **Node.js** (v20+)
- **Docker & Docker Compose**
- **Groq API Key** ([Get one here](https://console.groq.com/))
- **Cohere API Key** ([Get one here](https://cohere.com/))
- **Brevo API Key** ([Get one here](https://www.brevo.com/))

### 1. Clone the repository

```bash
git clone https://github.com/CipherHitro/CheckMyWarranty.git
cd CheckMyWarranty
```

### 2. Configure Environment Files

Create `.env` in `backend/` and `frontend/` directories:

```bash
cp backend/.env.production backend/.env
```

Fill in your `GROQ_API`, `COHERE_API_KEY`, and other required values.

### 3. Launch Local Development Containers

Run Docker Compose to start PostgreSQL (with pgvector), Redis, RedisInsight, Loki, and Grafana:

```bash
cd backend
docker compose up -d
```

### 4. Run Database Migrations

Apply Prisma schema migrations to your local containerized PostgreSQL (this creates the `document_chunks` table with the `vector(1024)` column):

```bash
npx prisma migrate dev
```

> **Note:** Your PostgreSQL instance must have the **pgvector** extension enabled. The migration files handle `CREATE EXTENSION IF NOT EXISTS vector;` automatically.

### 5. Access Local Services

- **Backend Server:** `http://localhost:3000`
- **Frontend App:** `http://localhost:5173`
- **RAG Chat API:** `POST http://localhost:3000/api/chat`
- **Grafana Dashboard:** `http://localhost:3001` *(Default credentials: `admin` / `admin` - Loki datasource pre-configured)*
- **RedisInsight:** `http://localhost:5540`
- **Bull Board UI:** `http://localhost:3000/admin/queues`

---

## ☁️ Production Deployment & CI/CD

### 1. AWS Infrastructure Setup
- **EC2 Instance:** Ubuntu t2.micro / t3.micro.
- **AWS RDS:** PostgreSQL instance (with `pgvector` extension enabled) for database durability.
- **AWS S3 Bucket:** Private S3 bucket with IAM credentials configured for pre-signed URLs.

### 2. Nginx Reverse Proxy Configuration (EC2)

To ensure **Server-Sent Events (SSE)** function without proxy buffer delays, configure Nginx as follows:

```nginx
server {
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # SSE Stream Configuration (Bypass Buffering)
    location /api/data/events {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
```

### 3. GitHub Actions CI/CD Pipeline

Deployments are fully automated via GitHub Actions (`.github/workflows/deploy.yml`). On every push to `main`:

1. GitHub Actions connects to the EC2 server over SSH.
2. Pulls the latest commit from `main`.
3. Injects GitHub Repository Secrets into `.env`.
4. Executes zero-downtime container builds: `docker compose -f docker-compose.prod.yml build`.
5. Runs Prisma database migrations: `docker compose -f docker-compose.prod.yml run --rm app npx prisma migrate deploy`.
6. Starts updated containers in detached mode and prunes stale Docker images.

---

## 📊 Logging & Observability

`CheckMyWarranty` uses **Pino** and `pino-loki` for structured log management:

- **Development:** Pino logs are shipped to the local `loki` container (`http://127.0.0.1:3100`) and visually queried in local Grafana (`http://localhost:3001`).
- **Production (Grafana Cloud):** To preserve the memory constraints of AWS EC2 Free Tier instances, local Loki and Grafana containers are omitted in `docker-compose.prod.yml`. Instead, the app streams logs directly over HTTPS to **Grafana Cloud Loki** using `LOKI_HOST`, `LOKI_AUTH_USER`, and `LOKI_AUTH_PASSWORD`.

---

## 📄 License

This project is licensed under the **ISC License**.

---

## 👤 Author

**Rohit Rathod** — [GitHub Profile](https://github.com/CipherHitro)
