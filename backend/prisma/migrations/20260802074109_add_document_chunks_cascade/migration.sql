-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "fk_document_chunk" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
