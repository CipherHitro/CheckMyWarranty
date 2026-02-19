# 📋 CheckMyWarranty

A full-stack web application that helps users manage product warranties by uploading warranty documents (PDFs and images), automatically extracting expiry dates using AI, and sending email reminders before warranties expire.

---

## ✨ Features

- **User Authentication** — Secure signup/login with hashed passwords and JWT-based sessions (httpOnly cookies in production, client-side cookies in development).
- **Document Upload** — Upload warranty documents (PDF, JPEG, PNG, WebP, GIF) via drag-and-drop or file picker with a 10 MB size limit.
- **AI-Powered Extraction** — Automatically extracts purchase date, item name, and warranty expiry date from uploaded documents using Groq LLMs:
  - Text-based PDFs → **Llama 3.1 8B Instant** (text extraction)
  - Scanned/image PDFs → **Llama 4 Scout 17B** (vision model)
  - Image files → **Llama 4 Scout 17B** (vision model)
- **Smart Reminders** — Automatically creates reminder entries in the database and sends email notifications via **Brevo** (formerly Sendinblue):
  - 7 days before expiry (first reminder)
  - 3 days before expiry (final urgent reminder)
- **Cron-Based Scheduler** — A `node-cron` job runs daily to process due reminders and send emails.
- **File Storage** — Local disk storage in development; **Supabase Storage** with signed URLs in production.
- **Responsive UI** — Clean, modern dashboard built with React and Tailwind CSS.

---

## 🏗️ Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 19 | UI library |
| React Router v7 | Client-side routing |
| Tailwind CSS v4 | Styling |
| Vite 7 | Build tool & dev server |
| Lucide React | Icons |
| React Hot Toast | Toast notifications |
| js-cookie | Cookie management (dev mode) |

### Backend
| Technology | Purpose |
|---|---|
| Express 5 | HTTP server & REST API |
| PostgreSQL (pg) | Relational database |
| bcryptjs | Password hashing |
| jsonwebtoken | JWT auth tokens |
| Groq SDK | AI-powered warranty extraction |
| pdf-parse v2 | PDF text extraction & page rendering |
| Multer | File upload handling |
| Brevo (@getbrevo/brevo) | Transactional reminder emails |
| node-cron | Scheduled reminder processing |
| Supabase JS | Cloud file storage (production) |

---

## 📁 Project Structure

```
CheckMyWarranty/
├── backend/
│   ├── index.js                  # Express server entry point
│   ├── connection.js             # PostgreSQL pool connection
│   ├── package.json
│   ├── controller/
│   │   ├── manageData.js         # Upload, delete, fetch documents
│   │   └── user.js               # Signup & login handlers
│   ├── middlewares/
│   │   └── auth.js               # JWT authentication middleware
│   ├── migrations/
│   │   └── schema.sql            # Database schema (users, documents, reminders)
│   ├── routes/
│   │   ├── manageData.js         # /api/data routes (auth-protected)
│   │   └── user.js               # /api/user routes (public)
│   ├── services/
│   │   ├── auth.js               # JWT sign & verify helpers
│   │   ├── brevoEmailService.js  # Brevo transactional email sender
│   │   ├── extractWarranty.js    # AI warranty detail extraction
│   │   ├── reminderCron.js       # Cron job for processing reminders
│   │   └── supabaseStorage.js    # Supabase Storage upload/delete/signed URLs
│   └── uploads/                  # Local file storage (dev only)
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx               # Router & layout setup
│       ├── main.jsx              # React entry point
│       ├── context/
│       │   └── AuthContext.jsx   # Auth state management
│       ├── components/
│       │   ├── dashboard/
│       │   │   └── FilePreviewModal.jsx
│       │   ├── layout/
│       │   │   ├── AuthLayout.jsx
│       │   │   ├── DashboardLayout.jsx
│       │   │   └── Navbar.jsx
│       │   ├── routes/
│       │   │   ├── PrivateRoute.jsx
│       │   │   └── PublicRoute.jsx
│       │   └── ui/
│       │       ├── Button.jsx
│       │       ├── InputField.jsx
│       │       └── Spinner.jsx
│       ├── hooks/
│       │   └── useFormValidation.js
│       └── pages/
│           ├── Dashboard.jsx     # Main document management page
│           ├── Login.jsx
│           └── Register.jsx
│
└── README.md
```

---

## 🗄️ Database Schema

The application uses **PostgreSQL** with three tables:

- **users** — Stores user accounts (`id`, `email`, `password_hash`, `created_at`)
- **documents** — Stores uploaded warranty documents linked to users (`id`, `user_id`, `file_url`, `original_filename`, `expiry_date`, `created_at`)
- **reminders** — Stores scheduled reminders linked to users and documents (`id`, `user_id`, `document_id`, `remind_at`, `status`, `created_at`)

Run `backend/migrations/schema.sql` to initialize the database.

---

## 🔌 API Endpoints

### Authentication (`/api/user`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/user/signup` | Register a new user |
| POST | `/api/user/login` | Login and receive JWT token |

### Document Management (`/api/data`) — *Requires Authentication*
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/data/upload` | Upload a warranty document (multipart/form-data) |
| GET | `/api/data/getAll` | Fetch all documents for the logged-in user |
| DELETE | `/api/data/remove` | Delete a document by ID |

### Health Check
| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Check database connectivity |

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)

```env
# Database
PGURL=postgresql://user:password@host:port/dbname

# Auth
secret=your_jwt_secret

# Mode
mode=development   # or "production"

# Frontend URL (CORS)
FRONTEND_URL=http://localhost:5173

# AI Extraction
GROQ_API=your_groq_api_key

# Email (Brevo)
BREVO_API=your_brevo_api_key
BREVO_SENDER_EMAIL=noreply@yourdomain.com
BREVO_SENDER_NAME=CheckMyWarranty

# Supabase Storage (production only)
SUPABASE_URL=https://your-project.supabase.co
SERVICE_ROLE=your_supabase_service_role_key
SUPABASE_BUCKET=your_bucket_name
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:3000/api
VITE_MODE=development
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18+)
- **PostgreSQL** database
- **Groq API key** — [Get one here](https://console.groq.com/)
- **Brevo API key** — [Get one here](https://www.brevo.com/)
- **Supabase project** (optional, for production file storage)

### 1. Clone the repository

```bash
git clone https://github.com/CipherHitro/CheckMyWarranty.git
cd CheckMyWarranty
```

### 2. Set up the database

Create a PostgreSQL database and run the schema migration:

```bash
psql -U your_user -d your_database -f backend/migrations/schema.sql
```

### 3. Configure environment variables

Create `.env` files in both `backend/` and `frontend/` directories using the templates above.

### 4. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 5. Start the development servers

```bash
# Backend (from backend/)
npm run dev

# Frontend (from frontend/)
npm run dev
```

The backend runs on `http://localhost:3000` and the frontend on `http://localhost:5173`.

---

## 🔄 How It Works

1. **User registers/logs in** → JWT token is issued and stored as a cookie.
2. **User uploads a warranty document** → File is saved (locally or to Supabase) and a database record is created.
3. **AI extraction runs in the background** → The document is analyzed by Groq LLMs to extract the warranty expiry date.
4. **Reminder is automatically created** → Based on the expiry date, reminders are scheduled at 7 days and 3 days before expiry.
5. **Cron job processes reminders daily** → Sends styled HTML emails via Brevo to notify users of upcoming warranty expirations.
6. **Dashboard auto-polls** → The frontend polls every 4 seconds for documents with pending AI extraction, updating the UI when results are ready.

---

## 📄 License

ISC

---

## 👤 Author

**Rohit Rathod** — [GitHub](https://github.com/CipherHitro)
