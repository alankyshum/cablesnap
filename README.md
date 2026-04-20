# CableSnap 💪

**Free, open-source workout & macro tracker.** A lightweight, responsive alternative to commercial fitness apps — no subscriptions, no ads, no paywalls.

[<img src="https://f-droid.org/badge/get-it-on.png" alt="Get it on F-Droid" height="80">](https://alankyshum.github.io/cablesnap/repo)

> **Custom F-Droid repo** — open the link above on your Android device to add the repo, or add it manually in F-Droid:\
> `https://alankyshum.github.io/cablesnap/repo`

## Features

- 🏋️ **Workout Tracking** — Log and track your workouts
- 🔍 **Exercise Library** — Browse and search exercises
- 🍎 **Nutrition Tracking** — Track macros and meals
- 📊 **Progress Charts** — Visualize your fitness journey
- 📱 **Responsive** — Works on phones and tablets
- 🌙 **Dark Mode** — Auto-detects system preference
- 📦 **Data Portable** — Full import/export (JSON backup, CSV)

## Tech Stack

- **Framework:** React Native + Expo
- **Language:** TypeScript
- **Navigation:** Expo Router (file-based)
- **UI Library:** BNA UI (custom component library)
- **Icons:** lucide-react-native, @expo/vector-icons

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- npm
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (installed via npx)
- iOS Simulator + Xcode (macOS) or Android Emulator
- [EAS CLI](https://docs.expo.dev/build/introduction/) (`npm install -g eas-cli`) — for building the development client

### Install

```bash
git clone https://github.com/alankyshum/cablesnap.git
cd cablesnap
npm install
```

### Development Build (Recommended)

CableSnap uses [expo-dev-client](https://docs.expo.dev/develop/development-builds/introduction/) instead of Expo Go, which enables native module support (e.g., HealthKit integration).

```bash
# Build the development client for iOS Simulator
npx expo run:ios

# Build the development client for Android Emulator
npx expo run:android

# Or use EAS Build for a development build
eas build --profile development --platform ios
eas build --profile development --platform android
```

After the first build, start the dev server and the app will connect automatically:

```bash
npx expo start --dev-client
```

### Run on Web

```bash
npm run web
```

> **Note:** Expo Go is no longer supported for development. Use the development build workflow above.

## Project Structure

```
cablesnap/
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

## Support

If you find CableSnap useful, consider supporting development:

<a href="https://buymeacoffee.com/alankyshum"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FF6038?style=for-the-badge&logo=buy-me-a-coffee&logoColor=white" height="40"></a>

<a href="https://thanks.dev/u/gh/alankyshum"><img src="https://img.shields.io/badge/thanks.dev-Support%20OSS-brightgreen?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDIxLjM1bC0xLjQ1LTEuMzJDNS40IDE1LjM2IDIgMTIuMjggMiA4LjUgMiA1LjQyIDQuNDIgMyA3LjUgM2MxLjc0IDAgMy40MS44MSA0LjUgMi4wOUMxMy4wOSAzLjgxIDE0Ljc2IDMgMTYuNSAzIDE5LjU4IDMgMjIgNS40MiAyMiA4LjVjMCAzLjc4LTMuNCA2Ljg2LTguNTUgMTEuNTRMMTIgMjEuMzV6IiBmaWxsPSJ3aGl0ZSIvPjwvc3ZnPg==&style=for-the-badge" height="40"></a>

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)** — see the [LICENSE](LICENSE) file for details.

**"CableSnap"** is a trademark of Persoack. Forks and redistributions must remove all CableSnap branding (name, logo, icon) unless granted written permission.

For commercial licensing inquiries, contact the repository owner.
