# PES-CoGo

# CoGo — Community Carpooling for Daily Commutes

A community-based carpooling platform focused on **routine commuting** (home–work / home–university) in Barcelona.  
The app helps people share empty seats in cars **inside trusted communities** (e.g., FIB/UPC or companies) and integrates **Barcelona Open Data** to provide proactive mobility support:
- **Real-time traffic status** warnings (congestion/incidents before departure)
- **Air quality**–aware “Healthy Meeting Point” suggestions (lower-exposure pickup areas)
- **Sustainability impact metrics** (estimated CO₂ savings, seat utilization)

---

## Table of contents
- [Project overview](#project-overview)
- [Key features](#key-features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Datasets](#datasets)
- [Repository structure](#repository-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Run the project](#run-the-project)
- [Testing](#testing)
- [Contributing workflow](#contributing-workflow)
- [Roadmap](#roadmap)
- [NOT list (scope)](#not-list-scope)
- [License](#license)

---

## Project overview
**TrustRide BCN** is designed for people who commute daily and want a reliable way to carpool without the “stranger risk”.  
Instead of open-to-everyone matching, users join a **verified community** (university/company) and only match with members inside that trust network.

In addition to matching drivers and passengers, the app uses open datasets to help users make better decisions:
- warn about traffic incidents before leaving,
- suggest cleaner pickup areas based on air quality,
- and quantify environmental impact.

---

## Key features
### Core (MVP)
- Community onboarding (invite code / email domain whitelist)
- User profiles with basic trust info
- Create & manage **recurring trips** (origin, destination, days, time window)
- Offer seats / request seats / accept or reject requests
- Matching & recommendations (route + time overlap)
- Trip coordination (meeting point + in-app chat/messages)
- Cancellation flow + notifications

### Data-driven features
- **Traffic alerts** before departure using Barcelona Open Data (real-time traffic status)
- **Healthy Meeting Point**: recommends pickup areas with lower pollution within a radius
- **Impact metrics**: estimated CO₂ saved + seat utilization

### Admin
- Basic moderation: manage reports, users, and communities

---

## Tech stack
> Still needs to be decided !!

- Frontend: `React`, `Ionic/Angular`, `Next.js`
- Backend: `Node.js (Express)` / `Java (Spring)` / `Python (FastAPI)`
- Database: `PostgreSQL`  / `MongoDB`
- Maps: 
- Realtime chat: `WebSocket` / `Socket.IO`
- CI: 

---

## Architecture
High-level components:
- **Frontend**: web UI or Mobile app (map, trips, matching, chat)
- **Backend API**: auth + communities + trips + matching + notifications
- **Data Integrations Service**: periodic fetch/cache of traffic + air quality datasets
- **Database**: users, communities, trips, requests, messages, reports, snapshots

---

## Datasets
We integrate Barcelona open datasets to enrich user experience:

- **Real-time traffic status (Barcelona Open Data)**  
  Used to warn users about congestion/incidents and suggest alternative departure times.

- **Air quality in the city of Barcelona (Barcelona Open Data)**  
  Used for the “Healthy Meeting Point” feature, recommending lower-exposure pickup areas.

> Add the exact dataset URLs here once you finalize them.

---

## Repository structure
> Needs to be decided.


