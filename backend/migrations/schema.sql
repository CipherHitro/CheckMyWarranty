-- USERS TABLE
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DOCUMENTS TABLE
CREATE TABLE documents (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    file_url TEXT NOT NULL,
    original_filename TEXT,
    expiry_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user
        FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- REMINDERS TABLE
CREATE TABLE reminders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    document_id BIGINT NOT NULL,
    remind_at TIMESTAMP NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_reminder
        FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_document_reminder
        FOREIGN KEY(document_id)
        REFERENCES documents(id)
        ON DELETE CASCADE
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_reminders_user_id ON reminders(user_id);
CREATE INDEX idx_reminders_status ON reminders(status);
