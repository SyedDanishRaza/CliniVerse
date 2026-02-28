# CliniVerse - Smart Clinic Management System

A mid-level vanilla JavaScript web application for a Clinic Management System built with Firebase Authentication, Firestore, jsPDF, and Cloudinary. This project emphasizes role-based access control, responsive UI with modern vanilla CSS, and secure serverless backend interactions.

## Features

- **Role-Based Authentication**: Admin, Doctor, Receptionist roles.
- **Patient Management**: Full CRUD operations for patients with search functionality.
- **Appointment Management**: Booking, tracking, and filtering appointments by status.
- **Prescription System**: Dynamic PDF generation using jsPDF, uploaded and securely stored via Cloudinary.
- **Dashboard Analytics**: Role-specific statistics and widgets. 

## Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+).
- **Backend & Database**: Firebase Authentication (Email/Password), Cloud Firestore.
- **File Storage**: Cloudinary (for generated PDF prescriptions).
- **PDF Generation**: jsPDF library.
- **Icons**: FontAwesome / Heroicons (SVG).
- **Fonts**: Google Fonts (Inter, Roboto).

## Setup & Deployment

1. **Clone the repository:**
   ```bash
   git clone <repository_url>
   cd CliniVerse
   ```

2. **Configure Firebase & Cloudinary:**
   - Update `assets/js/firebase-config.js` with your Firebase web app credentials.
   - Update the Cloudinary preset and cloud name inside `assets/js/prescriptions.js`.

3. **Deploy Firebase Rules:**
   - Deploy the provided `firestore.rules` via the Firebase CLI to secure your database.
   ```bash
   firebase deploy --only firestore:rules
   ```

4. **Local Development:**
   - Use any simple local web server to run the application (e.g., VS Code Live Server, or `npx serve .`).

## Folder Structure

```
/
├── assets/
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── app.js
│       ├── auth.js
│       ├── firebase-config.js
│       ├── utils.js
│       └── ...
├── pages/
│   ├── login.html
│   ├── admin-dashboard.html
│   ├── doctor-dashboard.html
│   ├── receptionist-dashboard.html
│   ├── patients.html
│   ├── appointments.html
│   └── prescriptions.html
├── firestore.rules
└── index.html
```
