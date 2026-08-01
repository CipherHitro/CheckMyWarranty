-- AlterTable
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "documents" ADD COLUMN     "rag_status" VARCHAR(20) DEFAULT 'pending';

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "document_id" BIGINT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1024),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_document_chunks_document_id" ON "document_chunks"("document_id");

-- CreateIndex
CREATE INDEX "idx_document_chunks_user_id" ON "document_chunks"("user_id");
