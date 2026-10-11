CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"start_line" integer NOT NULL,
	"end_line" integer NOT NULL,
	CONSTRAINT "chunk_lines" CHECK ("chunks"."start_line" > 0 AND "chunks"."end_line" >= "chunks"."start_line")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_workspace_id_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"line_count" integer NOT NULL,
	CONSTRAINT "files_workspace_id_snapshot_id_path_unique" UNIQUE("workspace_id","snapshot_id","path"),
	CONSTRAINT "files_workspace_id_snapshot_id_id_unique" UNIQUE("workspace_id","snapshot_id","id"),
	CONSTRAINT "safe_file_path" CHECK ("files"."path" !~ '(^/|(^|/)\.\.(/|$)|\\)')
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"fence" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"lease_until" timestamp with time zone,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_run_id_unique" UNIQUE("run_id"),
	CONSTRAINT "job_status" CHECK ("jobs"."status" IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "job_attempts" CHECK ("jobs"."attempt" >= 0 AND "jobs"."max_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_run_id_role_unique" UNIQUE("run_id","role")
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'fixture' NOT NULL,
	"active_snapshot_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repositories_workspace_id_name_unique" UNIQUE("workspace_id","name"),
	CONSTRAINT "repositories_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "fixture_only" CHECK ("repositories"."kind" = 'fixture')
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"sequence" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"conversation_id" uuid,
	"snapshot_id" uuid,
	"kind" text NOT NULL,
	"question" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "runs_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "run_kind" CHECK ("runs"."kind" IN ('index', 'question')),
	CONSTRAINT "run_status" CHECK ("runs"."status" IN ('queued', 'running', 'completed', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"revision" text NOT NULL,
	"file_count" integer NOT NULL,
	"chunk_count" integer NOT NULL,
	"diagnostics" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshots_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "snapshots_workspace_id_repository_id_revision_unique" UNIQUE("workspace_id","repository_id","revision")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_workspace_id_snapshot_id_file_id_files_workspace_id_snapshot_id_id_fk" FOREIGN KEY ("workspace_id","snapshot_id","file_id") REFERENCES "public"."files"("workspace_id","snapshot_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_repository_id_repositories_workspace_id_id_fk" FOREIGN KEY ("workspace_id","repository_id") REFERENCES "public"."repositories"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_workspace_id_snapshot_id_snapshots_workspace_id_id_fk" FOREIGN KEY ("workspace_id","snapshot_id") REFERENCES "public"."snapshots"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_run_id_runs_workspace_id_id_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_conversation_id_conversations_workspace_id_id_fk" FOREIGN KEY ("workspace_id","conversation_id") REFERENCES "public"."conversations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_run_id_runs_workspace_id_id_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_workspace_id_run_id_runs_workspace_id_id_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_workspace_id_repository_id_repositories_workspace_id_id_fk" FOREIGN KEY ("workspace_id","repository_id") REFERENCES "public"."repositories"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_workspace_id_snapshot_id_snapshots_workspace_id_id_fk" FOREIGN KEY ("workspace_id","snapshot_id") REFERENCES "public"."snapshots"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_workspace_id_conversation_id_conversations_workspace_id_id_fk" FOREIGN KEY ("workspace_id","conversation_id") REFERENCES "public"."conversations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_workspace_id_repository_id_repositories_workspace_id_id_fk" FOREIGN KEY ("workspace_id","repository_id") REFERENCES "public"."repositories"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chunks_workspace_id_snapshot_id_index" ON "chunks" USING btree ("workspace_id","snapshot_id");--> statement-breakpoint
CREATE INDEX "jobs_status_available_at_index" ON "jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "run_events_workspace_id_run_id_sequence_index" ON "run_events" USING btree ("workspace_id","run_id","sequence");--> statement-breakpoint
CREATE INDEX "runs_workspace_id_created_at_index" ON "runs" USING btree ("workspace_id","created_at");