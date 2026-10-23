# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

CUBO serves drivers, parents or guardians, minors, families, and friends. Drivers use it before, during, and after trips; connected people use it to share safety information, location, and selected controls.

## Product Purpose

CUBO helps drivers prepare for trips, navigate, monitor attention, receive audible safety alerts, report and receive community road hazards, review drive activity, and use the CUBO Assistant or CUBO Voice Assist for app and trip questions.

## Positioning

CUBO combines on-device attention monitoring, navigation, safety scoring, family controls, community road reports, and a local-first assistant in one driving-safety experience without requiring a paid AI service.

## Operating Context

The product is used on phones in portrait orientation, often in a vehicle. Important tasks must remain legible and operable with quick glances, while drive-time controls must minimize interaction and keep critical state obvious. The web build is distributed as an installable Cloudflare Pages PWA; Expo supports the native development version.

## Capabilities and Constraints

- Preserve existing Firebase authentication, account sync, family and friend roles, permissions, hazard data, drive recording, maps, camera calibration, voice behavior, and WebLLM behavior.
- Community hazards are shared with authenticated nearby users regardless of family or friend relationships.
- New accounts begin with a starter safety score of 100 until measured drives update it.
- The `shashank-new-ui` branch carries the premium interface; backend schemas and feature behavior stay compatible with production.
- Keep camera, microphone, and location use explicit and permission-based.
- Maintain light and dark modes, reduced-motion support, readable contrast, and at least 44-point touch targets.

## Brand Commitments

The product name is CUBO. Green remains the identifying color, but it should feel restrained, premium, and functional rather than neon. The user explicitly selected Tesla Robotaxi and the supplied Mobbin screenshots as the primary UI-quality reference, with supporting lessons from polished map-first, health-dashboard, and commerce interfaces. The result must be original CUBO design, not a copied trademark, logo, or branded screen.

## Evidence on Hand

The repository contains working production screens, current app copy, CUBO vehicle artwork, map and route interfaces, account data, drive events, and test coverage. The six screenshots supplied in the October 22 request are visual references only. No commercial claims, testimonials, or external performance claims should be invented.

## Product Principles

1. Driving safety state is readable in a glance.
2. Maps and next actions lead; supporting data stays calm.
3. Connected-account controls clearly show who can see or change what.
4. Voice and assistant features remain interruptible, bounded, and honest about available data.
5. Premium means confident hierarchy, motion with purpose, and fewer stronger surfaces—not decorative clutter.

## Accessibility & Inclusion

Support system appearance, reduced motion, clear focus and selected states, screen-reader labels, readable contrast, and touch targets sized for one-handed mobile use.
