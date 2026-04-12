# FitForge 💪

**Free, open-source workout & macro tracker.** A lightweight, responsive alternative to commercial fitness apps — no subscriptions, no ads, no paywalls.

## Features

- 🏋️ **Workout Tracking** — Log and track your workouts
- 🔍 **Exercise Library** — Browse and search exercises
- 🍎 **Nutrition Tracking** — Track macros and meals
- 📊 **Progress Charts** — Visualize your fitness journey
- 📱 **Responsive** — Works on phones and tablets
- 🌙 **Dark Mode** — Auto-detects system preference
- 📦 **Data Portable** — Full import/export (coming soon)

## Tech Stack

- **Framework:** React Native + Expo
- **Language:** TypeScript
- **Navigation:** Expo Router (file-based)
- **UI Library:** React Native Paper (Material Design 3)
- **Icons:** @expo/vector-icons (MaterialCommunityIcons)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- npm
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (installed via npx)
- iOS Simulator (macOS) or Android Emulator, or the [Expo Go](https://expo.dev/go) app on your device

### Install

```bash
git clone https://github.com/anomalyco/fitforge.git
cd fitforge
npm install
```

### Run

```bash
# Start the development server
npx expo start

# Run on specific platform
npm run android
npm run ios
npm run web
```

Scan the QR code with the Expo Go app on your phone, or press `a` for Android emulator / `i` for iOS simulator.

## Project Structure

```
fitforge/
├── app/                     # Expo Router pages
│   ├── (tabs)/              # Tab navigation
│   │   ├── _layout.tsx      # Tab navigator config
│   │   ├── index.tsx        # Workouts tab
│   │   ├── exercises.tsx    # Exercises tab
│   │   ├── nutrition.tsx    # Nutrition tab
│   │   ├── progress.tsx     # Progress tab
│   │   └── settings.tsx     # Settings tab
│   └── _layout.tsx          # Root layout
├── components/              # Shared components
├── constants/               # Theme, colors
├── assets/                  # Images, fonts
├── .github/workflows/       # CI/CD
├── app.config.ts            # Expo configuration
├── tsconfig.json            # TypeScript config
└── .eslintrc.js             # ESLint config
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
