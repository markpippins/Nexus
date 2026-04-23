# `serv` Directory Documentation

This directory contains all the backend microservices for the application. Each service is a standalone Node.js server written in TypeScript. They are designed to be run independently and are orchestrated by a conceptual [API Gateway / Broker](./gemini-broker-service.md).

## Services

### File Service (`serv/file/fs-serv.ts`)

-   **Purpose:** A mock backend that provides RESTful file system operations. It operates on a sandboxed directory on the local disk.
-   **Port:** `8080` (or `FS_SERVER_PORT` from `.env`)
-   **Endpoint:** `POST /fs`
-   **Functionality:** Handles operations like `listFiles`, `createDirectory`, `deleteFile`, `rename`, `copy`, and `move`.
-   **Sandboxing:** This service uses the `alias` parameter in the request body to create a unique root directory for each alias inside a main `fs_root` directory. This is a critical security and data-isolation feature. The `alias` is typically a **username** (for authenticated users) or a **profile name** (for anonymous connections), ensuring that file operations for one user or profile cannot affect another's data.

### Image Service (`serv/image/image-serv.ts`)

-   **Purpose:** A dynamic and static image server for file and folder icons.
-   **Port:** `8081` (or `IMAGE_SERVER_PORT` from `.env`)
-   **Endpoints:**
    -   `GET /ui/:name`: For special UI element icons (e.g., "Home", "Desktop").
    -   `GET /name/:name`: For icons based on a specific file or folder name.
    -   `GET /ext/:extension`: For icons based on a file extension.
-   **Functionality:** It first attempts to serve a static image file (e.g., `png`, `svg`) from a configured directory. If a static file is not found, it generates and serves a fallback SVG icon on the fly.

### Google Search Service (`serv/search/gsearch-serv.ts`)

-   **Purpose:** A proxy backend for the Google Custom Search API.
-   **Port:** `8082` (or `SEARCH_SERVER_PORT` from `.env`)
-   **Endpoint:** `POST /search`
-   **Functionality:** Accepts a JSON body with a `query`, forwards it to the official Google API, and returns the live search results.
-   **Configuration:** This service **requires** a `GOOGLE_API_KEY` and `SEARCH_ENGINE_ID` to be set in a `.env` file in the project root to function correctly. If these keys are not provided, the service will still run but will return an error to any client that attempts to use it. The frontend application is designed to handle this error and fall back to mock data.

### Unsplash Service (`serv/unsplash/image-search.ts`)

-   **Purpose:** A mock backend that simulates the Unsplash image search API.
-   **Port:** `8083` (or `UNSPLASH_SERVER_PORT` from `.env`)
-   **Endpoint:** `POST /search/photos`
-   **Functionality:** Accepts a JSON body with a `query` and returns a static list of mock image data that mimics the real Unsplash API response structure.