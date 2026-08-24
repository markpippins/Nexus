-- 001-kodi.sql
-- DBA provisioning for Kodi 21.2 shared-library mode (MySQL 8.0).
-- Runs automatically via /docker-entrypoint-initdb.d on first boot of an
-- empty volume; safe to re-run manually at any time (idempotent).
--
-- `kodi` schema: created per operator instruction (utility/staging).
-- `kodi_video` + `kodi_music`: the two databases Kodi's shared-library mode
-- actually requires (video and music libraries MUST live in separate
-- schemas - both contain tables named `path`, `art`, `settings`, `version`).
-- advancedsettings.xml should name kodi_video / kodi_music.

-- Schemas ---------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS `kodi`       CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS `kodi_video` CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS `kodi_music` CHARACTER SET utf8mb4;

-- Kodi user --------------------------------------------------------------
-- mysql_native_password: Kodi's bundled MySQL client does not reliably
-- speak caching_sha2_password (MySQL 8 default); this is the known-good
-- auth plugin for Kodi. Revisit only if/when we move off mysql:8.0.
CREATE USER IF NOT EXISTS 'kodi'@'localhost' IDENTIFIED WITH mysql_native_password BY 'kodipass';
CREATE USER IF NOT EXISTS 'kodi'@'%'         IDENTIFIED WITH mysql_native_password BY 'kodipass';

-- Grants ----------------------------------------------------------------
GRANT ALL PRIVILEGES ON `kodi`.*       TO 'kodi'@'localhost';
GRANT ALL PRIVILEGES ON `kodi_video`.* TO 'kodi'@'localhost';
GRANT ALL PRIVILEGES ON `kodi_music`.* TO 'kodi'@'localhost';
GRANT ALL PRIVILEGES ON `kodi`.*       TO 'kodi'@'%';
GRANT ALL PRIVILEGES ON `kodi_video`.* TO 'kodi'@'%';
GRANT ALL PRIVILEGES ON `kodi_music`.* TO 'kodi'@'%';

FLUSH PRIVILEGES;