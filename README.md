# CUBO Synced App

## Branches

- `main`: standalone web app, deployed to [CUBO on Cloudflare Pages](https://cubo-app-cac.pages.dev/).
- `expo-version`: native Expo / Expo Go app, preserved separately from the web deployment.
- `standaloneapp`: synchronized web release branch for Cloudflare Pages.
- `ui-expirements`: web UI sandbox based on the current release code.

Use `npm start` on `expo-version`. Use `npm run build:web` on `main`.
Shared fixes should be applied and tested in each platform branch; do not merge platform setup blindly.

Signed-in account data uses bounded, owner-only Firestore records with an offline device copy. See [Account sync](docs/account-sync.md) for the exact synced and device-local boundaries.

An **AI-powered driving safety app** that connects to the CUBO dash device to monitor distracted driving, track driver behavior, and give parents or users clear reports to improve safety.

## Features

- **Driver Distraction Score** — real-time safety rating (0–100)
- **Distraction Time Tracking** — daily breakdowns of distraction events
- **Goals & Insights** — actionable goals like minimizing phone distractions and keeping attention on the highway
- **Trends Dashboard** — track distractions per minute over time
- **Blocked Apps** — choose distracting apps to restrict while driving
- **Vehicle Management** — manage and monitor connected vehicles

## 🎥 App Demo

[![CUBO App Demo](https://img.youtube.com/vi/7hDUQYFQ1TE/0.jpg)](https://www.youtube.com/watch?v=7hDUQYFQ1TE)

▶️ [Watch the full app demo on YouTube](https://www.youtube.com/watch?v=7hDUQYFQ1TE)

## Tech Stack

- React Native / Expo
- TypeScript

---

## 🔗 Connected Project: CUBO MediaPipe/YOLO Distraction Detector

The core computer vision engine that powers the distraction detection — uses **MediaPipe Face Mesh** for head-pose estimation and **YOLOv8** for phone detection.

[![GitHub](https://img.shields.io/badge/GitHub-CUBO--MEDIAPIPE--YOLO--DEMO-181717?style=for-the-badge&logo=github)](https://github.com/DhruvaValluru/CUBO-MEDIAPIPE-YOLO-DEMO)

---

<p align="center">
  <a href="mailto:dhruva.valluru@gmail.com"><img src="https://img.shields.io/badge/Gmail-D14836?style=for-the-badge&logo=gmail&logoColor=white" alt="Gmail"/></a>
  &nbsp;
  <a href="https://www.linkedin.com/in/dhruvavalluru"><img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn"/></a>
  &nbsp;
  <a href="https://github.com/DhruvaValluru"><img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub"/></a>
</p>
