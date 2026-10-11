-- Extension is provisioned now; no embeddings/vector retrieval in phase 1.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
ALTER TABLE chunks ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
  to_tsvector('simple', path || ' ' || content || ' ' || regexp_replace(content, '([a-z0-9])([A-Z])', '\1 \2', 'g'))
) STORED;
--> statement-breakpoint
CREATE INDEX chunks_search_gin ON chunks USING gin(search_vector);
--> statement-breakpoint
ALTER TABLE snapshots ADD CONSTRAINT snapshot_repository_identity UNIQUE(workspace_id, repository_id, id);
--> statement-breakpoint
ALTER TABLE repositories ADD CONSTRAINT active_snapshot_scope FOREIGN KEY(workspace_id,id,active_snapshot_id) REFERENCES snapshots(workspace_id,repository_id,id);
--> statement-breakpoint
CREATE FUNCTION immutable_snapshot_data() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Snapshot data is immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER snapshots_immutable BEFORE UPDATE OR DELETE ON snapshots FOR EACH ROW EXECUTE FUNCTION immutable_snapshot_data();
--> statement-breakpoint
CREATE TRIGGER files_immutable BEFORE UPDATE OR DELETE ON files FOR EACH ROW EXECUTE FUNCTION immutable_snapshot_data();
--> statement-breakpoint
CREATE TRIGGER chunks_immutable BEFORE UPDATE OR DELETE ON chunks FOR EACH ROW EXECUTE FUNCTION immutable_snapshot_data();
