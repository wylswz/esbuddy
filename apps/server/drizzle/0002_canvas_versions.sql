CREATE TABLE `canvas_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`canvas_id` text NOT NULL,
	`canvas_name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`snapshot` text NOT NULL,
	`created_by_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `canvas_versions_canvas_id_idx` ON `canvas_versions` (`canvas_id`,`created_at`);