CREATE TABLE `workspace_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`role` text NOT NULL,
	`created_by_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_tokens_token_hash_unique` ON `workspace_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `workspace_tokens_workspace_id_idx` ON `workspace_tokens` (`workspace_id`,`created_at`);