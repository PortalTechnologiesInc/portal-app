# Portal App

![Portal App](https://github.com/PortalTechnologiesInc/.github/raw/main/profile/logoFull.png?raw=true)

Portal is a mobile identity wallet for secure authentication and payments using the [Nostr](https://nostr.com) protocol. Built with React Native and Expo, it puts you in complete control of your digital identity and personal data with enterprise-grade security.

## ✨ Features

### 🔐 Authentication & Identity

- **Nostr Authentication**: Cryptographically secure authentication with websites and services
- **Biometric Security**: Face ID, Touch ID, and fingerprint authentication
- **Secure Key Management**: Private keys never leave your device
- **Identity Management**: Complete control over your digital identity

### 💳 Payments & Subscriptions

- **Lightning Payments**: One-time Bitcoin Lightning Network payments
- **Cashu/eCash Support**: Native Cashu token support for eCash payments and transactions
- **Subscription Management**: Monitor and control recurring payments
- **Payment Status Tracking**: Real-time payment status with Revolut-style UI
- **Wallet Integration**: Seamless NWC (Nostr Wallet Connect) integration

### 📱 User Experience

- **Activity Dashboard**: Comprehensive tracking of all authentications and payments
- **QR Code Scanner**: Quick authentication and payment initiation
- **NFC Scanning**: Contactless NFC tag scanning for authentication and ticket validation
- **Ticket Management**: Digital ticket storage, validation, and recovery
- **Dark/Light Theme**: Adaptive theme system with system preference support
- **Intuitive Navigation**: Tab-based navigation with detailed activity views

### 🔒 Security & Privacy

- **Local Storage**: All sensitive data stored securely on device
- **Biometric Protection**: Additional security layer for sensitive operations
- **No Data Sharing**: Zero personal data shared without explicit consent
- **Cryptographic Verification**: All operations cryptographically verified

## 🛠 Technology Stack

### Core Technologies

- **[React Native](https://reactnative.dev/)** - Cross-platform mobile development
- **[Expo](https://expo.dev/)** - Development platform and SDK
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe development
- **[Expo Router](https://docs.expo.dev/router/introduction/)** - File-based navigation

### Storage & Security

- **[Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)** - Local database storage
- **[Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)** - Secure key storage
- **[Expo LocalAuthentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/)** - Biometric authentication

### Nostr & Payments

- **[Nostr Protocol](https://nostr.com)** - Decentralized identity and messaging
- **[Custom Rust lib](https://github.com/PortalTechnologiesInc/lib)** - Core Nostr logic and cryptography
- **NWC Integration** - Nostr Wallet Connect for Lightning payments

### UI & Theming

- **[Lucide React Native](https://lucide.dev/)** - Beautiful icon library
- **Custom Theme System** - Adaptive dark/light theme support
- **Safe Area Context** - Proper device-safe rendering

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **Expo CLI**: `npm install -g @expo/cli`
- **iOS Simulator** (Mac) or **Android Studio** (for emulators)

### Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/PortalTechnologiesInc/Portal-App.git
   cd Portal-App
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Start the development server**:

   ```bash
   npx expo start
   ```

4. **Run on device/simulator**:

   ```bash
   # iOS
   npx expo run:ios

   # Android
   npx expo run:android

   # Web (development only)
   npx expo start --web
   ```

## 📱 Usage Guide

### First-Time Setup

1. **Generate Identity**: Create a new Nostr private key or import existing seed phrase
2. **Profile Configuration**: Set up your identity information
3. **Wallet Connection**: Connect your NWC-compatible Lightning wallet

### Authentication Flow

1. **Scan QR Code or NFC Tag**: Use built-in scanner or NFC reader from website or service
2. **Review Request**: Examine authentication details and permissions
3. **Biometric Confirmation**: Confirm with Face ID/Touch ID
4. **Approve/Deny**: Complete the authentication process

### Payment Management

1. **Payment Requests**: Review incoming payment requests (Lightning or Cashu)
2. **Status Tracking**: Monitor payment progress with real-time updates
3. **Subscription Control**: Manage recurring payments and subscriptions
4. **Ticket Management**: Store, validate, and recover digital tickets via NFC
5. **Activity History**: View complete payment and authentication history

## 🏗 Project Architecture

### Directory Structure

```
portal-app/
├── app/                    # Expo Router pages
│   ├── (tabs)/            # Tab navigation screens
│   │   ├── ActivityList.tsx
│   │   ├── Certificates.tsx
│   │   ├── Debug.tsx
│   │   ├── IdentityList.tsx
│   │   ├── Settings.tsx
│   │   ├── Subscriptions.tsx
│   │   └── Tickets.tsx
│   ├── activity/[id]/     # Dynamic activity detail pages
│   ├── nfc/               # NFC scanner flow
│   ├── qr/               # QR scanner flow
│   ├── subscription/[id]/ # Subscription management
│   ├── (onboarding)/     # First-time setup flow
│   ├── wallet.tsx        # Wallet management
│   ├── recoverTickets.tsx # Ticket recovery
│   └── relays.tsx        # Nostr relay configuration
├── components/            # Reusable UI components
│   ├── ActivityDetail/   # Activity-specific components
│   └── ui/              # Base UI components
├── context/              # React Context providers
│   ├── ActivitiesContext.tsx
│   ├── ECashContext.tsx
│   ├── NostrServiceContext.tsx
│   └── ThemeContext.tsx
├── services/             # Core business logic
│   ├── DatabaseService.ts
│   ├── BiometricAuthService.ts
│   └── SecureStorageService.ts
├── hooks/               # Custom React hooks
├── models/              # TypeScript interfaces
├── constants/           # App constants and configuration
└── utils/               # Helper functions and utilities
```

### State Management

- **Context-based Architecture**: Multiple specialized contexts for different domains
- **SQLite Database**: Persistent storage for activities, subscriptions, and user data
- **Secure Storage**: Encrypted storage for sensitive keys and tokens

## 🔧 Development

### Available Scripts

```bash
# Start development server
npm start

# Run on specific platforms
npm run android
npm run ios
npm run web

# Code formatting
npm run format
npm run format:check

# Linting
npm run lint

# Testing
npm test
```

### Key Development Patterns

#### Theme-Aware Components

```typescript
import { useThemeColor } from '@/hooks/useThemeColor';

const backgroundColor = useThemeColor({}, 'background');
const textColor = useThemeColor({}, 'textPrimary');
```

#### Database Operations

```typescript
import { DatabaseService } from '@/services/DatabaseService';
import { useSQLiteContext } from 'expo-sqlite';

const db = useSQLiteContext();
const dbService = new DatabaseService(db);
```

#### Biometric Authentication

```typescript
import { BiometricAuthService } from '@/services/BiometricAuthService';

const authResult = await BiometricAuthService.authenticate();
```

### Adding New Features

1. **Create Components**: Add to appropriate directory in `components/`
2. **Update Context**: Extend existing or create new context providers
3. **Database Schema**: Update database migrations in `migrations/`
4. **Type Definitions**: Add interfaces to `models/` directory
5. **Navigation**: Add routes in `app/` directory following Expo Router conventions

## 📦 Building & Deployment

### EAS Build Configuration

The project uses Expo Application Services (EAS) for building and deployment:

```bash
# Install EAS CLI
npm install -g eas-cli

# Build for development
eas build --profile development

# Build for production
eas build --profile production

# Submit to app stores
eas submit
```

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit changes**: `git commit -m 'Add amazing feature'`
4. **Push to branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines

- **TypeScript**: All new code must be written in TypeScript
- **Theme Support**: All components must support dark/light themes
- **Security First**: Follow secure coding practices, especially for key management
- **Component Architecture**: Create reusable, well-documented components
- **Context Usage**: Use appropriate context providers for state management

## 📄 License

This project is licensed under the MIT License with Common Clause - see the [LICENSE](LICENSE) file for details.

## 🔐 Security

Portal prioritizes security and privacy:

- **🔑 Private Key Security**: All private keys stored in device secure enclave
- **🔒 Biometric Protection**: Additional security layer for sensitive operations
- **🛡️ No Data Leakage**: Zero telemetry or data collection
- **✅ Cryptographic Verification**: All operations cryptographically signed and verified
- **🏠 Local-First**: Everything runs locally on your device

## 📞 Support

- **Documentation**: [Portal Docs](https://docs.getportal.com)(TBD)
- **Issues**: [GitHub Issues](https://github.com/PortalTechnologiesInc/Portal-App/issues)
- **Community**: [Discord Server](https://discord.gg/)(TBD)
- **Email**: support@portal.com(TBD)

---

**Built with ❤️ by the Portal Team**
