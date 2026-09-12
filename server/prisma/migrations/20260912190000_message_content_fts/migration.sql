CREATE INDEX "message_content_fts_idx"
  ON "Message"
  USING GIN (to_tsvector('simple', translate(coalesce("content", ''), 'ёЁ', 'ее')));
