# Product Specification Document: Aether Archive

## 1. Project Overview
**Name:** Aether Archive
**Concept:** A highly aesthetic, mobile-first, locally-hosted web application serving as a personal digital sanctuary. It allows the user to curate and view their aesthetic photos (nature, anime, manga) and monthly 6-picture "dumps" in a visually immersive, minimalist environment.
**Primary Target Device:** Mobile Browser (accessed via local network, e.g., `192.168.x.x:3000` from a smartphone).
**Vibe/Aesthetic:** Minimalist, moody, high-end editorial, glassmorphism, seamless fluid animations. Focus is on the images; UI should be almost invisible.

## 2. Tech Stack Recommendations (For the Agent)
To achieve the high-fidelity UI and robust local backend requested, the following stack is mandated:
*   **Frontend:** React.js (using Vite for fast local building), Tailwind CSS (for utility styling and glassmorphism), Framer Motion (for fluid, tactile animations and route transitions), `@dnd-kit/core` (for mobile-friendly drag-and-drop).
*   **Backend:** Java Spring Boot (REST API).
*   **Database:** SQLite or H2 (embedded, file-based to keep it strictly local and lightweight).
*   **Storage:** Local File System (directories managed by Spring Boot).

## 3. Core User Experience (UX) & UI Views

### 3.1. The Immersive Splash (Home)
*   **Behavior:** On app load, the user sees absolutely zero UI (no menus, no borders, no text). 
*   **Visual:** A single, randomly selected high-quality photo from the user's archive is displayed in absolute full-screen (`100dvh`, `100dvw` with `object-fit: cover`).
*   **Interaction:** A single tap anywhere on the screen triggers the "Glassmorphism Menu".

### 3.2. The Glassmorphism Menu (Navigation)
*   **Visual:** Triggered by a tap, a full-screen or modal overlay appears using heavy CSS `backdrop-filter: blur(15px)` and a semi-transparent dark tint (`rgba(0,0,0,0.4)`).
*   **Typography:** Elegant, thin, serif or sans-serif fonts (e.g., *Playfair Display* or *Inter*).
*   **Items:** 
    *   "The River" (Feed view)
    *   "Curate" (Upload/Workshop view)
    *   "Close" (Returns to Immersive Splash)
*   **Animation:** Must fade in softly with a slight upward translate motion (Framer Motion).

### 3.3. The Time River (Feed / Gallery)
*   **Behavior:** An infinite, vertical scrolling feed of all past uploads.
*   **Visual:** Images take up the majority of the screen width. 
    *   For "Dumps": The 6 photos are displayed in a beautifully spaced vertical column. The background of the entire page smoothly transitions to the specific `backgroundColor` chosen for that specific dump as it scrolls into view.
    *   For single pictures (Anime/Nature): Displayed with generous negative space (padding).
*   **Typography:** The only text visible is elegant, minimalist month/year markers (e.g., *September 2026*) separating the flows. No borders, no distinct cards. Just content flowing into content.

### 3.4. The Curator's Workshop (Upload Interface)
*   **Purpose:** Uploading monthly "dumps" or single aesthetic shots.
*   **Flow for "Dumps":**
    1.  **Selection:** Standard native OS file picker (accepts max 6 images).
    2.  **The Canvas (Sorting):** The 6 images appear in a grid. The user **must** be able to drag and drop them to rearrange their order. This requires touch-compatible drag-and-drop mechanics.
    3.  **Aura (Color Selection):** A color picker (or hex input) to select the background color that matches the "vibe" of this specific month's dump. The UI background should preview this color live.
    4.  **Publish:** A sleek "Save Archive" button.

## 4. Backend Architecture & Data Models (Spring Boot)

### 4.1. Entities
**Entity: `ArchiveItem` (Base)**
*   `id` (UUID)
*   `type` (Enum: SINGLE_PIC, ANIME, MONTHLY_DUMP)
*   `title` (String, nullable - e.g., "September")
*   `timestamp` (Date)
*   `backgroundColor` (String, hex code, e.g., "#121212")

**Entity: `Photo`**
*   `id` (UUID)
*   `archiveItemId` (UUID, Foreign Key)
*   `localFilePath` (String)
*   `displayOrder` (Integer - crucial for the dump arrangement)

### 4.2. API Endpoints
*   `GET /api/v1/archives/random` - Returns a single random photo URL for the Splash screen.
*   `GET /api/v1/archives/river` - Returns a chronological list of `ArchiveItem` with their nested `Photo`s.
*   `POST /api/v1/archives/dump` - Accepts `multipart/form-data`.
    *   Params: `images` (Array of files, up to 6), `order` (Array of indices), `backgroundColor` (String), `title` (String).
    *   *Action:* Saves files to a local directory (e.g., `~/AetherArchive_Data/images/`), saves paths to DB, maintains order.
*   `POST /api/v1/archives/single` - Accepts single photo uploads.

## 5. Development Phases for the AI Agent

**Phase 1: Foundation & Backend**
*   Initialize Spring Boot project.
*   Configure local SQLite/H2 database and file system storage utility.
*   Create Entities, Repositories, and REST Controllers.
*   Test API endpoints using Postman/curl.

**Phase 2: Frontend Scaffold & Splash**
*   Initialize React + Vite + Tailwind.
*   Set up global CSS (hide scrollbars, set up typography).
*   Implement `GET /api/v1/archives/random` and build the Immersive Splash view.
*   Implement the tap-to-open Glassmorphism Menu.

**Phase 3: The Curator's Workshop (Complex UI)**
*   Build the upload form.
*   Implement `@dnd-kit/core` for the 6-image drag-and-drop grid.
*   Implement live background color preview.
*   Wire the submit button to the `POST /api/v1/archives/dump` endpoint.

**Phase 4: The Time River (Scroll & Polish)**
*   Fetch all data via `GET /api/v1/archives/river`.
*   Implement the vertical feed.
*   Implement the scroll listener (e.g., using `IntersectionObserver`) to dynamically change the body `backgroundColor` based on the dump currently in view.
*   Polish Framer Motion transitions between all routes.

## 6. Crucial Constraints
*   **Images must be served locally.** The Spring Boot app must implement a `WebMvcConfigurer` to serve the local image directory as static resources (e.g., mapping `/images/**` to `file:/path/to/local/folder/`).
*   **Performance:** Since the app relies heavily on high-quality images, ensure the UI does not block during image loading.
*   **No Clutter:** Do not add standard app headers, footers, or persistent navbars. The aesthetic relies on emptiness and focus.