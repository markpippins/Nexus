# FS Crawler Specification Document

### 1. Introduction

The FS Crawler system is designed for media metadata indexing, file scanning, and duplicate detection. It aims to provide a robust and configurable solution for managing media libraries. This specification details its current state, APIs, data models, and frontend functionalities.

### 2. Architecture Overview

The FS Crawler system is built using a microservices-oriented architecture with a Python backend and a React frontend.

*   **Backend:**
    *   **Language:** Python
    *   **Web Framework:** FastAPI
    *   **Databases:**
        *   **MongoDB:** Stores media file metadata, directory metadata, duplicate resolution logs, deletion rules, and rule statistics.
        *   **MySQL:** Stores library path configurations, file types, and metadata handler definitions.
        *   **Redis:** Used for scan state management (progress tracking, checkpoints), rule caching, and potentially other ephemeral data.
    *   **Core Services:**
        *   `ScannerService`: Handles file system traversal, metadata extraction, and resumable scanning.
        *   `MetadataProcessor`: Extracts metadata from various file types using a plugin-based handler system (audio, image, generic).
        *   `DuplicateDetector`: Identifies duplicate files using audio fingerprints and content hashes, and assesses file quality.
        *   `RulesEngine`: Evaluates predefined rules against file metadata to determine actions for duplicates (delete, keep, review).
        *   `DuplicateResolver`: Orchestrates the process of resolving duplicates by applying rules.
        *   `StartupService`: Manages application initialization and graceful shutdown.

*   **Frontend:**
    *   **Framework:** React
    *   **Build Tool:** Vite
    *   **Language:** TypeScript
    *   **UI Library:** Material UI (`@mui/material`)
    *   **Key Libraries:** React Router, TanStack Query, Axios, Zustand, React Hook Form, Zod, Date-fns.
    *   **Functionality:** Provides a web interface for managing library paths, monitoring scan operations, viewing statistics, configuring duplicate resolution rules, and interacting with the backend API.

### 3. Backend APIs

The backend exposes a RESTful API under the `/api/v1` prefix.

#### 3.1. System Endpoints

*   `GET /system/status`: Retrieves overall system status, including version, uptime, startup time, operational status, and active scans.
    *   **Response:** `SystemStatus` object.
*   `GET /health`: Checks the health of connected databases (Redis, MongoDB, MySQL).
    *   **Response:** `HealthStatus` object indicating connection status for each database.

#### 3.2. Library Management Endpoints

Manages directories to be scanned by the system.

*   `GET /libraries`: Lists all configured library paths.
    *   **Response:** An array of `LibraryPath` objects.
*   `POST /libraries`: Adds a new library path with configuration options (name, scan enabled, deep scan, path type, duplicate handling settings).
    *   **Request Body:** `CreateLibraryPathForm` object.
    *   **Response:** `{ message: string, id: number }`.
*   `PUT /libraries/{library_id}`: Updates an existing library path's configuration.
    *   **Request Body:** Partial `CreateLibraryPathForm` object.
    *   **Response:** `{ message: string, id: number }`.
*   `DELETE /libraries/{library_id}`: Deletes a library path configuration.
    *   **Response:** `{ message: string, id: number }`.

#### 3.3. Scanning Endpoints

Manages file scanning operations.

*   `POST /scan/start`: Initiates a scan operation for all configured libraries or a specific path. Uses background tasks for asynchronous execution.
    *   **Request Body (optional):** `{ path?: string }`.
    *   **Response:** `{ message: string }`.
*   `GET /scan/status`: Retrieves the status of ongoing and recent scan operations.
    *   **Response:** `ScanStatus` object detailing active scans and their states.
*   `POST /scan/stop`: Stops all currently running scan operations.
    *   **Response:** `{ message: string, stopped_count: number }`.

#### 3.4. Statistics Endpoints

Provides aggregated data related to indexed files and system activity.

*   `GET /stats`: Returns overall file statistics, including total files, directories, and counts/sizes by category.
    *   **Response:** `FileStatistics` object.
*   `GET /duplicates/stats`: Returns statistics related to duplicate detection, such as the number of duplicate groups, total duplicates found, files marked for deletion, and best quality files identified.
    *   **Response:** `DuplicateStats` object.

#### 3.5. Duplicate Detection Endpoints

Endpoints for identifying and managing duplicate files within the media library.

*   `POST /duplicates/detect`: Triggers the duplicate detection process. Can optionally auto-mark duplicates for deletion based on predefined rules.
    *   **Query Params:** `auto_mark` (boolean).
    *   **Response:** `{ message: string }`.
*   `GET /duplicates/candidates`: Retrieves a list of files that have been marked as candidates for deletion.
    *   **Query Params:** `limit` (number).
    *   **Response:** `{ deletion_candidates: any[], total_count: number }`.
*   `GET /duplicates/groups`: Retrieves groups of duplicate files, allowing filtering by detection method (fingerprint or content hash) and limiting the results.
    *   **Query Params:** `method` ('fingerprint' | 'hash'), `limit` (number).
    *   **Response:** `{ duplicate_groups: Group[], method: string, total_groups: number }`.

#### 3.6. Rules Engine Endpoints

Manages the rules used for determining actions on duplicate files.

*   `GET /rules`: Lists all deletion rules, optionally filtered by their enabled status.
    *   **Query Params:** `enabled_only` (boolean).
    *   **Response:** `{ rules: DeletionRule[], total_count: number }`.
*   `POST /rules`: Creates a new deletion rule with specified conditions and actions.
    *   **Request Body:** `DeletionRule` object.
    *   **Response:** `{ rule_id: string, message: string }`.
*   `PUT /rules/{rule_id}`: Updates an existing rule identified by its ID.
    *   **Request Body:** Patch object containing the fields to update.
    *   **Response:** `{ message: string }`.
*   `DELETE /rules/{rule_id}`: Deletes a rule.
    *   **Response:** `{ message: string }`.
*   `POST /rules/defaults`: Creates a set of default deletion rules if they do not already exist.
    *   **Response:** `{ created_rules: string[], message: string }`.
*   `POST /rules/templates`: Creates a new rule based on a predefined template (e.g., for deleting low-quality MP3s or preferring album versions).
    *   **Request Body:** `{ template_name: string, parameters?: object }`.
    *   **Response:** `{ rule_id: string, template: string, message: string }`.
*   `GET /rules/templates`: Lists available rule templates and their configurable parameters.
    *   **Response:** `{ templates: { [templateName: string]: { description: string, parameters: object } } }`.

#### 3.7. Duplicate Resolution Endpoints

Orchestrates the process of resolving duplicate files using the configured rules.

*   `POST /duplicates/resolve`: Initiates the duplicate resolution process. It can perform a dry run to analyze potential actions or execute the resolution, potentially marking files for deletion or keeping based on the rules.
    *   **Request Body:** `{ dry_run: boolean, batch_size?: number, rule_set_id?: string }`.
    *   **Response:** `{ message: string }` or preview results if `dry_run` is true.
*   `GET /duplicates/resolution-stats`: Retrieves statistics on past duplicate resolution actions, detailing groups processed, deletions, keeps, and reviews.
    *   **Response:** `ResolutionStats` object.
*   `GET /duplicates/preview`: Provides a preview of potential resolution decisions without making any changes to the files or database.
    *   **Query Params:** `limit` (number).
    *   **Response:** `ResolutionGroupResult[]` (sample resolution outcomes).

#### 3.8. Configuration Endpoints

Manages system configurations such as supported file types and metadata handlers.

*   `GET /config/file-types`: Lists the file types supported by the system.
    *   **Response:** `FileType[]` array.
*   `GET /config/handlers`: Lists the metadata handlers available for processing different file types.
    *   **Response:** `MetadataHandler[]` array.

### 4. Data Models

#### 4.1. MongoDB Models

*   **`FileMetadata`**: Represents the detailed metadata extracted from a media file. Includes basic file information, extracted media-specific details (bitrate, title, artist, year, etc.), content hash for duplicate detection, path type classification, quality score, tags, and flags for deletion/review.
*   **`DirectoryMetadata`**: Stores information about scanned directories, including the absolute path, directory name, parent path, and the timestamp of the last scan.
*   **`DuplicateResolution`**: An audit log that records the decisions made during the duplicate resolution process for each duplicate group, tracking which files were kept, deleted, or marked for review.

#### 4.2. MySQL Models

*   **`LibraryPath`**: Stores configuration details for directories that the system scans. Includes the path, an optional name, scan settings (enabled, deep scan), path type classification (album, compilation, etc.), duplicate handling rules (auto-delete, quality threshold), preferred formats, and deletion priority.
*   **`FileType`**: Defines the types of files supported by the system (specific fields not fully detailed in code snippets).
*   **`MetadataHandler`**: Defines available handlers for extracting metadata from different file types (specific fields not fully detailed).
*   **`ScanOperation`**: Tracks the status and progress of scan operations, including start/end times, files scanned/processed, and any error messages.
*   **`DeletionRule`**: Defines the logic for duplicate handling. Includes conditions (based on file attributes and duplicate context), actions (DELETE, MARK\_FOR\_REVIEW, etc.), scope (library paths, file categories), priority, and usage statistics.
*   **`RuleGroup`**: Represents a logical grouping of conditions within a rule, combined using logical operators (AND, OR, NOT).
*   **`RuleCondition`**: Defines a single condition for evaluation, specifying a target field, comparison operator, value, and case sensitivity.
*   **`RuleAction`**: Defines the action to be performed if a rule's conditions are met, including the action type and a reason template.

#### 4.3. Redis Data

*   **Scan State:** Stores the progress and state of ongoing scans to enable resumption. Includes status, files processed, current file/directory, and lists of completed/remaining files. Data is keyed by scan ID.
*   **Rule Cache:** Temporarily stores fetched deletion rules to improve performance by reducing database reads.

### 5. Frontend Structure and Functionality

The frontend is a React SPA providing a user interface for managing the FS Crawler system.

#### 5.1. Core Layout (`Layout.tsx`)

*   Provides a consistent application structure featuring a Material UI `AppBar` at the top and a responsive `Drawer` (sidebar) for navigation.
*   Navigation includes links to the main sections: Dashboard, Libraries, Scanning, and Statistics.
*   Supports theme toggling between dark and light modes via a `ThemeContext`.
*   Displays system status indicators (system health, active scans) in the `AppBar`.

#### 5.2. Dashboard (`Dashboard.tsx`)

*   Presents a high-level overview of the system's status and recent activity.
*   Features "Quick Actions" such as starting/stopping scans and refreshing data.
*   Uses `Card` components to display summary statistics for:
    *   **System Overview:** Application version, uptime, startup time, and current system status.
    *   **File Statistics:** Total files and directories indexed, along with top file categories.
    *   **Scanning Status:** Number of active scans and details of recent scan operations.
    *   **Duplicate Statistics:** Counts of duplicate groups, candidates, and best quality files.
*   Includes a section for recent scan activity logs.

#### 5.3. Libraries Page (`Libraries.tsx`)

*   Enables users to manage library path configurations (directories to scan).
*   Displays configured paths in an interactive `Table` with details on path, name, type, scan settings, and duplicate rule configurations.
*   Provides functionality to add, edit, and delete library paths through modal dialogs.
*   The form for managing library paths includes comprehensive settings for scanning behavior and duplicate handling rules, with validation.
*   Includes confirmation dialogs for sensitive operations like deleting library paths.

#### 5.4. Scanning Page (`Scanning.tsx`)

*   Likely provides detailed views and controls for scan operations, showing the status of ongoing and past scans.
*   Users can monitor scan progress, view scan details, and potentially initiate or halt scans.

#### 5.5. Statistics Page (`Statistics.tsx`)

*   Presents detailed statistics on file indexing, scanning, and duplicate detection.
*   May incorporate visualizations like charts to illustrate data distribution (e.g., file categories, duplicate types).

### 6. Dependencies

*   **Backend:** Python 3.x, FastAPI, Uvicorn, Pydantic, SQLAlchemy, Motor (async MongoDB driver), PyMongo, Redis-py, Aiomysql, Cryptography, Mutagen (audio metadata), Pillow (image processing), ExifRead (image metadata), python-magic (file type detection), Aiofiles, Structlog (structured logging).
*   **Frontend:** Node.js, npm/yarn, React, React Router, Vite, TypeScript, Material UI (`@mui/material`), Emotion (`@emotion/react`, `@emotion/styled`), TanStack Query, Axios, Zustand, React Hook Form, Zod, Date-fns, Recharts.

### 7. Development and Build Process

*   **Backend:** The backend application can be run using `uvicorn` (e.g., `uvicorn app.main:app --reload`). Docker Compose files are provided for setting up the necessary services (databases, Redis) for development and deployment.
*   **Frontend:** The development server is started using `npm run dev` (or `yarn dev`). Production-ready frontend assets are built using `npm run build` (or `yarn build`).
