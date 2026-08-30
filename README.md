# UdrCrafts - Partner Portal

UdrCrafts is a modern, responsive web application designed as a Partner Portal for shipping and delivery partners of an artisan marketplace. It features a beautiful, dynamic UI with dark mode support, and a robust local-storage-based authentication and user management system.

## 🚀 Tech Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS & Framer Motion (for smooth micro-animations)
- **Icons**: Lucide React
- **Routing**: React Router DOM

## 📂 Project Structure

- `src/pages/` - Contains the main views: `Landing`, `Login`, `Signup`, `Dashboard`, `Profile`, and `Documents`.
- `src/contexts/` - Contains `AuthContext` (managing user sessions and mock database logic) and `ThemeContext` (handling dark/light mode toggles).
- `src/components/ui/` - Reusable UI components like `Card`, `Button`, `Input`, and `UploadZone`.
- `src/data/` - Contains fallback mock data for testing (e.g., `partners.ts`).

## 💾 Data Format & Authentication

The application uses the browser's **localStorage** to simulate a real database for user registrations and logins, ensuring that newly created accounts persist across sessions.

### User Data Model

When a new partner registers via the `Signup` page, their data is formatted into the following `User` object and saved to localStorage under the key `registeredUsers`:

```typescript
export interface User {
  id: string                    // Automatically generated (e.g., UDRSP1234)
  firstName: string
  lastName: string
  fullName: string              // Derived from firstName + lastName
  email: string
  phone: string                 // Used as the primary login identifier (10 digits)
  status: 'Verified' | 'Pending' | 'Rejected'
  partnerId: string             // Same as ID for now
  
  // Dynamic Dashboard Stats (Initialized to 0 for new users)
  rating?: number
  deliveries?: number
  earnings?: number
  todayDeliveries?: number
  
  // Personal & Contact Info
  mobile?: string
  currentAddress?: string
  permanentAddress?: string
  state?: string
  district?: string
  city?: string
  pincode?: string
  emergencyContactName?: string
  emergencyContactNumber?: string
  
  // System Info
  dateJoined?: string           // Automatically set to the current ISO date on signup
  
  // Additional KYC Data
  vehicleType?: string
  vehicleNumber?: string
  dateOfBirth?: string
  gender?: string
}
```

### Authentication Flow (`AuthContext`)

1. **Signup**: Captures user data, generates a unique ID, formats the `User` object (initializing stats like earnings/deliveries to `0`), pushes it to the `registeredUsers` array in `localStorage`, and logs the user in.
2. **Login**: The user logs in using their 10-digit mobile number (passwords/OTPs are mocked). The system first queries the `registeredUsers` array in `localStorage`. If found, it logs them in. If not found, it falls back to a list of dummy users in `src/data/partners.ts`. If the number matches neither, it throws an error: *"Account not found. Please create a new account."*

## 🎨 Design & UI

- **Theming**: A robust CSS-variable based theme system is defined in `index.css`. The dark mode uses a custom "Midnight Neon" palette, overriding Tailwind's default dark mode to provide deeper contrast and richer accents.
- **Micro-animations**: Leverages `framer-motion` for staggering list items, hovering on cards, and smoothly expanding accordions (e.g., Document verifications).
- **Responsive Layout**: Designed mobile-first. The landing page and dashboard seamlessly collapse into stackable layouts, hiding non-essential elements on smaller screens to prevent overflow.

## 🛠️ Setup & Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Build for production:
   ```bash
   npm run build
   ```

## 📝 Recent Updates
- Implemented strict form validations (Age > 18, accurate date formats, auto-uppercase for PAN/License).
- Upgraded the Dashboard and Profile to use Nullish Coalescing (`??`) so real `0` values (for brand new users) are displayed correctly instead of falling back to dummy stats.
- Fixed dark-mode readability issues (replacing hardcoded blacks with dynamic `text-foreground`).
