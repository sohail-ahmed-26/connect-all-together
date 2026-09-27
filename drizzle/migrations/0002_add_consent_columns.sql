-- Adding explicit opt_out column to contacts to reliably track consent instead of relying purely on status strings
ALTER TABLE `contacts` ADD COLUMN `opted_out` boolean NOT NULL DEFAULT false;

-- Adding do_not_contact to leads as well for lead-level consent
ALTER TABLE `leads` ADD COLUMN `do_not_contact` boolean NOT NULL DEFAULT false;
