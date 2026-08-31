CREATE TABLE `canvas_events` (
	`canvas_id` text NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text DEFAULT 'null' NOT NULL,
	`actor_id` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`canvas_id`, `seq`)
);
--> statement-breakpoint
CREATE TABLE `canvases` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`snapshot` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_by_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`token` text NOT NULL,
	`created_by_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`avatar_url` text,
	`provider` text DEFAULT 'google' NOT NULL,
	`google_sub` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` integer NOT NULL
);
