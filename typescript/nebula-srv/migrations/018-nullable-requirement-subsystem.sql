-- 018: Make subsystem_id optional on requirements_history
-- Requirements can live at system level without needing a subsystem.

ALTER TABLE nebula.requirements_history ALTER COLUMN subsystem_id DROP NOT NULL;
