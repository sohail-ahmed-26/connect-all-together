ALTER TABLE `leads` ADD COLUMN `target_profile_id` varchar(36) NOT NULL;
ALTER TABLE `leads` ADD COLUMN `provider_id` varchar(255) NULL;
ALTER TABLE `leads` ADD CONSTRAINT `leads_target_profile_id_target_profiles_id_fk` FOREIGN KEY (`target_profile_id`) REFERENCES `target_profiles` (`id`);
CREATE UNIQUE INDEX `unq_workspace_source_provider` ON `leads` (`workspace_id`, `source`, `provider_id`);
