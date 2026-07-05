# V-Med ID Platform - Complete Codebase Explanation

## 📋 Project Overview

**V-Med ID** is a secure, decentralized healthcare platform that bridges patients, doctors, and government institutions through a unified medical identity system. It enables:
- Unified patient medical records
- Doctor-patient consultations
- AI-powered health insights
- Emergency SOS system
- Blood donor network

---

## 🏗️ Architecture Overview

```
Frontend (HTML/CSS/JS) ← CORS → Backend (Node.js/Express) ← Firebase Admin SDK → Firestore
                                                                              ↓
                                                                         AI Services
                                                                      (Gemini, Groq)
```

---

## 📂 Project Structure

### **Root Level Files**

#### `package.json`
- **Purpose**: Node.js project configuration
- **Key Scripts**:
  - `npm start`: Starts the backend server
  - `npm run dev`: Development mode for backend
- **Dependencies**: Express, Firebase Admin SDK, Groq SDK, RSS Parser, CORS, Rate limiting

#### `firebase.json`
- **Purpose**: Firebase project configuration
- **Config**:
  - Firestore database in `asia-south1` region
  - References `firestore.rules` for security
  - References `firestore.indexes.json` for query optimization

#### `firestore.rules`
- **Purpose**: Security rules for database access control
- **Key Policies**:
  - **Users Collection**: Users can only read/write their own data; doctors can read any user; role fields cannot be modified by users
  - **vmedIndex Collection**: Public read (required for login lookup before authentication)
  - **Medical Records**: Patients can read own records; doctors/government can read any
  - **Helper Functions**: `getRole()`, `isOwner()`, `isAuthenticated()`, `isDoctor()`

#### `index.html`
- **Purpose**: Main landing page
- Entry point before authentication

#### `netlify.toml` & `README.md`
- **netlify.toml**: Deployment configuration for Netlify
- **README.md**: Project documentation and setup instructions

---

## 🔐 Frontend Code (`/js/`)

### `firebase.js`
```javascript
// Firebase Configuration & Initialization
- Initializes Firebase app with credentials
- Exports: app, auth, db
- Uses Firebase SDK version 10.7.1
- Project ID: vmed-id
```

### `auth.js`
```javascript
// Authentication Functions

export async function signupUser(email, password)
- Creates new user account with Firebase Auth

export async function loginWithVMEDId(vmedId, password)
- Looks up user by V-Med ID in vmedIndex collection
- Retrieves email from vmedIndex
- Performs email/password login
- Returns: user object, role, and status
- Validates UID match to prevent account mismatch
```

### `app.js` (Main Logic)
```javascript
// User Registration & Profile Creation

function generateVMEDId(role, fullName)
- Generates unique V-Med ID format: VMED-[role_letter]-[name]-[random_4_digit]
- Examples:
  - VMED-p-john-1234 (Patient)
  - VMED-d-jane-5678 (Doctor)
  - VMED-g-govt-9012 (Government)

export async function savePatientApplication(user, data)
- Creates patient profile in Firestore
- Writes to /users/{uid} collection
- Initializes empty arrays:
  * documents, vitalsHistory, medications, visits
  * emergencyContacts, familyMembers, linkedDoctors
- Creates vmedIndex entry for login lookup
- Stores identity info: name, DOB, Aadhaar, ABHA, gender
- Stores health info: blood group, occupation, conditions

export async function saveDoctorApplication(user, data)
- Similar to patient but includes:
  * Specializations
  * License number
  * Hospital/clinic details
  * Consultation fee
```

### `logout.js`
- Handles user logout functionality
- Signs out from Firebase Auth

### `routeGuard.js`
- Protects routes based on user authentication and role
- Redirects unauthenticated users to login
- Implements role-based access control (RBAC)

---

## 🖥️ Backend Code (`/backend/`)

### `server.js` (Express Server)
```javascript
// Core Backend Configuration

1. INITIALIZATION
- Detects Netlify environment (Cloud Functions)
- Loads .env file (local development)
- Initializes Firebase Admin SDK with service account

2. MIDDLEWARE SETUP
- CORS: Allows only whitelisted origins
  * localhost:5500 (dev)
  * vmed-id.web.app (Firebase Hosting)
  * vmed-id-platform-v1.netlify.app (Netlify)
- Express JSON parser: 1MB limit
- Rate limiting: 100 requests per 15 minutes

3. MEMORY CACHES
- healthCache: Caches AI health analysis results
- forecastCache: Caches vital forecasts
- chatCache: Caches chat conversations
- Auto-cleanup when cache exceeds 100 items

4. ENDPOINTS
- GET /api/health: Server status check
- POST /api/chat: AI-powered chat
- POST /api/forecast: Vital forecasting
- POST /api/health-analysis: Health analysis
- GET /api/news: RSS feed parser for health news

5. TOKEN VERIFICATION
- All /api/* endpoints require Firebase ID token
- Validates: Authorization: Bearer <idToken>
```

### `ai-provider.js` (AI Integration Engine)
```javascript
// Multi-Provider AI System with Fallback

PROVIDERS SUPPORTED:
1. Gemini 2.0 Flash (Primary)
   - Model: gemini-2.0-flash
   - Endpoint: generativelanguage.googleapis.com
   - Supports: structured output, function calling, RAG

2. Groq (Fallback - 429 errors)
   - Model: llama-3.3-70b
   - Endpoint: api.groq.com
   - Faster inference, better availability

3. OpenRouter (Optional)
   - Generic API-compatible provider

SAFETY SETTINGS (Gemini):
- BLOCK_MEDIUM_AND_ABOVE for:
  * Harassment
  * Hate speech
  * Sexually explicit content
  * Dangerous content

CLASS STRUCTURE:

export class GeminiProvider
  constructor(apiKey, model)
  - Initializes with API key and model name
  
  buildContents(history, userMessage)
  - Formats chat history into Gemini format
  - Converts all roles to "user" or "model"
  
  buildSystemInstruction(systemPrompt, openingAck)
  - Creates system-level instructions for model behavior
  
  async call({ contents, systemInstruction, generationConfig, safetySettings })
  - Calls Gemini API
  - Returns: { ok, status, text, finishReason, error }
  - Handles errors and fallback

export class GroqProvider
  - Same interface as Gemini
  - Uses Groq API endpoint
  - OpenAI-compatible format

export class AIProvider (Orchestrator)
  - Manages provider chain
  - Tries Gemini first
  - Falls back to Groq on 429 rate limit
  - Implements retry logic with exponential backoff
```

### `backend/package.json`
```json
Dependencies:
- express: Web framework
- cors: Cross-Origin Resource Sharing
- dotenv: Environment variables
- firebase-admin: Firebase server SDK
- rss-parser: Parse health news feeds
- express-rate-limit: API rate limiting
- serverless-http: Netlify Functions compatibility
```

---

## 📱 Frontend Screens (`/screens/`)

### **Login Screen** (`/login/`)
Files:
- `login.html`: Email/password login form
- `signup.html`: User role selection (Patient/Doctor/Gov)
- `signup_patient.html`: Patient registration form
- `signup_doctor.html`: Doctor registration form
- `auth_choice.html`: Authentication method selection
- `otp.html`: OTP verification (if enabled)
- CSS files for styling

**Flow**:
1. User chooses role (signup_choice)
2. Fills registration form (signup_patient.html / signup_doctor.html)
3. System generates V-Med ID
4. Profile data saved to Firestore
5. Redirected to dashboard

---

### **Patient Dashboard** (`/patient_dashboard/`)

#### Structure
```
index.html (Main SPA container)
├── js/
│   ├── dashboard.js (Main router & UI controller)
│   ├── userData.js (Firestore queries)
│   ├── home.js (Dashboard home page)
│   ├── medications.js (Medication management)
│   ├── history.js (Medical history)
│   ├── ai.js (AI chat interface)
│   ├── i18n.js (Internationalization: EN, HI, TE)
│   └── vStore.js (Client-side storage utility)
│
├── sections/ (HTML fragments loaded dynamically)
│   ├── home.html
│   ├── documents.html
│   ├── medications.html
│   ├── visits.html
│   ├── vitals.html
│   ├── ai.html (Chat interface)
│   ├── sos.html (Emergency SOS)
│   ├── blood_donor.html (Blood donor network)
│   ├── family.html (Family health links)
│   └── settings.html
│
└── lang/ (Translation files)
    ├── en.json (English)
    ├── hi.json (Hindi)
    └── te.json (Telugu)
```

#### `dashboard.js` (Main Controller)
```javascript
// Single Page Application (SPA) Router

KEY FUNCTIONS:

loadPage(pageName)
- Fetches section HTML from sections/ folder
- Injects into #content div
- Re-executes inline scripts
- Calls initialization function for that page
- Scroll to top

loadSection(btn, page, arg)
- Highlights active nav button
- Calls loadPage

toggleDark()
- Toggles dark mode
- Persists to localStorage
- Updates CSS classes

PAGES SUPPORTED:
- home: Dashboard overview
- documents: Medical documents
- medications: Medication list
- visits: Appointment history
- vitals: Vital signs tracking
- ai: AI chat/health analysis
- sos: Emergency SOS
- blood_donor: Blood donor registry
- family: Family health links
- settings: User preferences

MULTILINGUAL SUPPORT:
- Uses i18n system
- Translates all nav labels
- Detects browser language
- Can manually switch languages
```

#### `userData.js`
```javascript
// Firestore Data Management

FUNCTIONS:
- fetchUserData(): Get user profile
- fetchVitals(): Get vital signs history
- fetchMedications(): Get medication list
- fetchVisits(): Get appointment history
- addVital(data): Add new vital reading
- addMedication(data): Add medication
- updateProfilePhoto(photoURL): Update avatar
- fetchLinkedDoctors(): Get associated doctors
- unlinkDoctor(doctorId): Remove doctor link
```

#### `ai.js` (AI Chat)
```javascript
// AI Integration in Patient Dashboard

FEATURES:
- Chats with AI assistant (Gemini/Groq)
- System prompt for medical assistant behavior
- Shows loading state
- Streams responses
- Maintains conversation history
- Stores chat cache locally

API CALLS:
POST /api/chat
{
  message: "How are my vitals?",
  patientData: { ... },
  history: [ ... ]
}

RESPONSES:
- Health tips
- Vital forecasting
- Medication reminders
- Appointment suggestions
```

#### Internationalization (`i18n.js`)
```javascript
// Translation System

SUPPORTED LANGUAGES:
- en: English (default)
- hi: Hindi
- te: Telugu

FUNCTION:
t(key) - Returns translated string
- Example: t("nav.home") → "Home" or "होम"

USAGE:
document.textContent = t("nav.medications")

FILES:
lang/en.json, lang/hi.json, lang/te.json
```

---

### **Doctor Dashboard** (`/doctor_dashboard/`)

#### Structure
```
index.html
├── js/
│   ├── dashboard.js (Router & patient management)
│   ├── doctorData.js (Firestore queries)
│   └── settings.js
│
├── sections/
│   ├── home.html (Patient list overview)
│   ├── patients.html (All patients)
│   ├── add_patient.html (Add new patient)
│   ├── consultation.html (Consultation interface)
│   ├── add_document.html (Upload medical docs)
│   ├── history.html (Patient history)
│   ├── ai.html (AI decision support)
│   ├── patient_detail.html (Individual patient profile)
│   └── settings.html
```

#### `dashboard.js` (Doctor Controller)
```javascript
// Doctor Dashboard SPA

PAGES:
- home: Patient statistics & quick actions
- patients: List of linked patients
- add_patient: Search and link new patient
- consultation: Document patient consultation
- add_document: Upload medical records
- patient_detail: View individual patient details
- ai: AI-powered diagnosis support
- history: Patient medical history
- settings: Doctor preferences

FEATURES:
- Dark mode toggle
- Sidebar navigation
- Patient search/filtering
- Real-time data sync
- AI consultation support
```

---

### **Government Dashboard** (`/gov_dashboard/`)

#### Files
```
gov.js (Controller)
index.html (Main layout)
style.css (Styling)
```

**Purpose**: Government officials view:
- Aggregate health statistics
- Disease outbreak tracking
- Public health metrics
- Hospital/clinic registrations
- Vaccination records

---

## 🔄 Data Flow

### User Registration Flow
```
User selects role (signup.html)
     ↓
Fills registration form (signup_[role].html)
     ↓
Calls signupUser() (auth.js)
  └→ Creates Firebase Auth account
     ↓
Calls save[Role]Application() (app.js)
  ├→ Generates V-Med ID
  ├→ Writes to /users/{uid}
  ├→ Writes to /vmedIndex/{vmedId}
  └→ Initializes empty arrays
     ↓
User authenticated, redirected to dashboard
```

### Login Flow
```
User enters V-Med ID & password
     ↓
Calls loginWithVMEDId() (auth.js)
  ├→ Looks up vmedIndex/{vmedId}
  ├→ Retrieves email from index
  └→ Calls Firebase signInWithEmailAndPassword()
     ↓
Returns: user object, role, status
     ↓
Route guard checks role → Load appropriate dashboard
```

### AI Chat Flow
```
User sends message in dashboard
     ↓
AI endpoint receives request (backend/server.js)
     ↓
Verifies Firebase ID token
     ↓
Calls AIProvider.chat()
     ↓
Tries Gemini → Falls back to Groq on 429 error
     ↓
Returns: { text, finishReason, cacheHit }
     ↓
Response displayed in chat UI
```

### Medical Data Update Flow
```
Doctor adds medication/vital/document to patient
     ↓
Frontend calls updateDoc() with arrayUnion
  (Firestore client SDK)
     ↓
Firestore security rules verify:
  - User is doctor OR patient
  - Update only affects allowed fields
     ↓
Data written to Firestore
     ↓
Real-time listeners trigger dashboard refresh
```

---

## 🔒 Security Model

### Authentication
- **Firebase Auth**: Email/password signup
- **ID Tokens**: All API calls require Bearer token
- **Token Validation**: Backend verifies token before processing

### Database Security (Firestore Rules)
1. **User Documents** (`/users/{uid}`)
   - Users read/write only their own
   - Role field immutable
   - Doctors can read any user profile
   - Government can read any profile

2. **V-Med Index** (`/vmedIndex/{vmedId}`)
   - Publicly readable (for login lookup)
   - Only owner can create/update
   - Prevents privilege escalation

3. **Medical Records** (`/medical_records/{recordId}`)
   - Patients read only own
   - Doctors read any
   - Government read any

### API Rate Limiting
- 100 requests per 15 minutes per IP
- Prevents abuse of AI API quotas
- Returns 429 error when exceeded

### AI Safety
- Gemini safety settings block medium+ harmful content
- Input validation on all endpoints
- Output sanitization before display

---

## 🚀 Deployment

### Development
```bash
cd backend
npm install
node server.js
# Frontend: Live Server on port 5500
```

### Production
- **Backend**: Deployed as Netlify Functions (`/netlify/functions/`)
- **Frontend**: Deployed to Firebase Hosting
- **Database**: Firestore (asia-south1)
- **Environment**: Set Firebase service account in env vars

---

## 📊 Key Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | HTML/CSS/JavaScript | UI & user interactions |
| Frontend State | localStorage, IndexedDB | Client-side caching |
| Backend | Node.js + Express | API server |
| Database | Firestore | Real-time NoSQL database |
| Authentication | Firebase Auth | User identity & security |
| AI | Gemini 2.0 Flash, Groq | Medical insights & predictions |
| Deployment | Firebase Hosting, Netlify | Hosting & CDN |
| Internationalization | Custom i18n system | Multi-language support (EN, HI, TE) |

---

## 🎯 Key Features Implementation

### 1. **Unified Medical Identity (V-Med ID)**
- Format: `VMED-[role]-[name]-[random]`
- Stored in public `vmedIndex` for quick lookup
- Enables role-based access control

### 2. **Multi-Dashboard System**
- Patient dashboard: Track health metrics
- Doctor dashboard: Manage patients & consultations
- Government dashboard: Monitor public health

### 3. **AI-Powered Insights**
- Dual-provider system (Gemini + Groq fallback)
- Rate limiting prevents quota exhaustion
- Memory cache improves response time

### 4. **Real-time Data Sync**
- Firestore listeners trigger automatic UI updates
- Doctors can update patient records instantly
- Multi-device synchronization built-in

### 5. **Emergency SOS System**
- One-click emergency button
- Alerts family & nearby hospitals
- Location tracking (if enabled)

### 6. **Multilingual Support**
- Three languages: English, Hindi, Telugu
- All UI text translatable
- Language preference persisted locally

---

## 📝 File Reference Summary

```
PROJECT ROOT
├── js/
│   ├── app.js ...................... User registration & profile creation
│   ├── auth.js ..................... Authentication functions
│   ├── firebase.js ................. Firebase setup
│   ├── logout.js ................... Logout handler
│   └── routeGuard.js ............... Route protection middleware
│
├── backend/
│   ├── server.js ................... Express server & API endpoints
│   ├── ai-provider.js .............. AI orchestration (Gemini/Groq)
│   ├── package.json ................ Backend dependencies
│   └── serviceAccountKey.json ...... Firebase admin credentials
│
├── screens/
│   ├── login/ ...................... Authentication UI
│   ├── patient_dashboard/ .......... Patient SPA
│   ├── doctor_dashboard/ ........... Doctor SPA
│   └── gov_dashboard/ .............. Government dashboard
│
├── firebase.json ................... Firebase configuration
├── firestore.rules ................. Database security rules
├── firestore.indexes.json .......... Query optimizations
├── netlify.toml .................... Netlify deployment config
└── README.md ....................... Project documentation
```

---

This comprehensive platform demonstrates enterprise-grade healthcare software architecture with emphasis on security, scalability, and multi-user role management.
