# V-Med ID Platform

V-Med is a secure, decentralized healthcare platform that bridges the gap between Patients, Doctors, and Government institutions through a unified medical identity.

## 🚀 Key Features

*   **Unified Patient Dashboard**: Track your medical history, recent vitals, and appointments in one place.
*   **Role-Based Access Control**: Strict access separation for Patients, Doctors, and Government officials.
*   **AI-Powered Insights**: Get health tips and vitals forecasting powered by Gemini AI and Groq.
*   **Emergency SOS**: Instant one-click SOS system and localized blood donor network.
*   **Secure Backend**: Rate-limited, strictly CORS-enabled, and token-verified API layer ensuring enterprise-grade data security.

## 🛠 Tech Stack

*   **Frontend**: HTML, CSS, JavaScript
*   **Backend**: Node.js, Express
*   **Database**: Firebase Firestore
*   **Authentication**: Firebase Auth & Firebase Admin SDK
*   **AI Integration**: @google/genai, Groq SDK

## 🔒 Security Architecture

The platform uses a robust security model:
1.  **Firestore Security Rules**: Patients can only read their own data. Strict write rules prevent privilege escalation.
2.  **API Rate Limiting**: The Express backend limits requests to prevent abuse of the AI API quotas.
3.  **Token Authentication**: All `/api/*` endpoints require a valid Firebase ID token (`Authorization: Bearer <token>`).

## ⚙️ How to Run

1.  **Backend Setup**:
    ```bash
    cd backend
    npm install
    ```
2.  **Add Credentials**:
    Place your `serviceAccountKey.json` and `.env` files in the `backend/` directory.
3.  **Start the Server**:
    ```bash
    node server.js
    ```
4.  **Frontend**:
    Use Live Server to run the main website on port 5500.

**For demo you can contact me through gmail**:malavathrithvik@gmail.com
