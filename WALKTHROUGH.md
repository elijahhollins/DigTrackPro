# DigTrack Pro — Complete Feature Walkthrough

*Professional construction locate-ticket manager with AI scanning, mapping, scheduling, time tracking, and inventory.*

This guide walks through **every feature** in DigTrack Pro and the exact steps to use it. Features are grouped into:

- **Getting Started** — accounts, companies, roles, the interface
- **Core Features** — always available to every company
- **Optional Modules** — turned on per-company by an admin (Inbound, Field Ops, Time, Inventory)
- **Admin & Settings** — team, branding, notifications, module toggles

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [The Interface & Navigation](#2-the-interface--navigation)
3. [Tickets Dashboard (Locate Tickets)](#3-tickets-dashboard-locate-tickets)
4. [AI Ticket Scanning](#4-ai-ticket-scanning)
5. [Ticket Status, Refresh & No-Show Workflow](#5-ticket-status-refresh--no-show-workflow)
6. [Schedule (Calendar)](#6-schedule-calendar)
7. [Map](#7-map)
8. [Field Docs (Photos & Documents)](#8-field-docs-photos--documents)
9. [Jobs](#9-jobs)
10. [Documents & PDF Markup (in the Job Hub)](#10-documents--pdf-markup-in-the-job-hub)
11. [Crew / Team Management](#11-crew--team-management)
12. [Optional Module: Inbound Tickets](#12-optional-module-inbound-tickets)
13. [Optional Module: Field Ops (Scheduling)](#13-optional-module-field-ops-scheduling)
14. [Optional Module: Time Tracker](#14-optional-module-time-tracker)
15. [Optional Module: Inventory](#15-optional-module-inventory)
16. [Settings, Notifications & Branding](#16-settings-notifications--branding)
17. [Mobile & Offline](#17-mobile--offline)

---

## 1. Getting Started

### Roles
DigTrack Pro is **multi-tenant**: every user belongs to one company and only sees that company's data. There are three roles:

| Role | What they can do |
|------|------------------|
| **CREW** | View tickets, jobs, map, and docs; clock in/out; upload field photos; request a refresh or log a no-show. Read-only on most admin data. |
| **ADMIN** | Everything CREW can do **plus** create/edit/delete tickets and jobs, manage the team, send invites, configure notifications, and turn optional modules on/off. |
| **SUPER_ADMIN** | Everything ADMIN can do **plus** manage *all* companies on the platform (create, activate/deactivate, toggle each company's modules). |

### Create an account / company
1. Open the app — you land on the **Login** screen.
2. To start a brand-new company, click **Sign Up** and enter your name, email, and password.
3. After verifying your email, you'll be taken to **Company Registration**:
   - Enter your **company name**.
   - Pick a **brand color** (used to theme the whole app) from the presets or a custom color.
   - Optionally add **city, state, and phone**.
   - Click **Create**. You become the first **ADMIN** of that company.

### Join an existing company (invite link)
1. An admin sends you an **invite link** (contains an `?invite=` token).
2. Open the link — the sign-up form pre-fills the company name and validates the invite.
3. Enter your name, email, and password and submit. You join that company (default role **CREW**).
4. Verify your email, then log in.

> If your email isn't verified yet, the login screen offers a **Resend verification** option.

---

## 2. The Interface & Navigation

- **Top-left header** shows your **company name** (falls back to "DigTrack Pro" if none).
- **Navigation tabs** switch between views. Core tabs are always present; optional-module tabs (Field Ops, Time, Inventory) appear only when an admin has enabled them:
  - **Tickets** · **Jobs** · **Schedule** · **Map** · **Field Docs** · **Crew**
  - **Field Ops** · **Time** · **Inventory** *(optional)*
- **Dark / Light mode** — toggle in the header; your choice is remembered.
- **Document viewer** — clicking any ticket's document number opens the scanned PDF/image in an in-app viewer.
- The view you're on is reflected in the URL hash (e.g. `#map`), so you can bookmark or share a deep link, and browser back/forward works.

---

## 3. Tickets Dashboard (Locate Tickets)

The **Tickets** tab is the home screen — your live list of 811/locate tickets, grouped by job.

### Stat cards (one-click filters)
At the top, five summary cards double as filters. Click one to filter the list; click again to clear:

- **Active & Clear** — valid tickets safe to dig
- **Expiring Soon** — within the 3-day refresh window
- **Refresh Needed** — a refresh has been requested
- **No Shows** — tickets with a logged no-show
- **Expired** — past their expiration / dig-by date

### The ticket list
- Tickets are grouped under their **job number**, with an aggregate status dot (green = clear, amber = needs attention, red = expired).
- Each row shows the ticket number, street/cross-street, dates, status badge, and a **work-begun** indicator.
- **Admins:** click any row to open it for editing.
- Use **search** and **sort** to find tickets by number, street, job, dates, or status.
- **Show Archived** reveals superseded/old tickets (dimmed).

### Add or edit a ticket (Admin)
1. Click **Add Ticket** (or click a row to edit).
2. Fill in the fields, or use **AI scanning** to auto-fill (see next section).
3. Save. When you re-scan a ticket that already exists, you can choose to **archive the old one** and replace it with the refreshed version.

---

## 4. AI Ticket Scanning

DigTrack Pro reads your locate-ticket PDFs/photos and fills in the form for you.

### Steps
1. From **Add Ticket**, **drag-and-drop** (or browse to) one or more files — PDFs or photos (JPG/PNG). You can also use your device **camera** on mobile.
2. Each file enters an **ingestion queue** and moves through states:
   `pending → analyzing → uploading → ready` (or `error` / `duplicate`).
3. During **analyzing**, the file is sent to the server endpoint (`/api/parse-ticket`) which uses an AI model to extract structured fields: ticket number, job number, street, cross street, place/extent, county, city, state, call-in / work / dig-by / expiration dates, site contact, and even **latitude/longitude and a dig bounding box** when present.
4. **Duplicate detection:** if a scanned ticket matches one you already have, it's flagged as `duplicate` and linked to the existing record so you can refresh instead of double-entering.
5. Review the auto-filled fields, correct anything, and **Save**. The original document is stored and viewable from the ticket.

> If scanning fails, you'll get a clear message — e.g. **RATE_LIMITED** (try again shortly) or **ACCESS_DENIED** (the server's AI credentials/billing need attention). You can always enter the ticket manually.

---

## 5. Ticket Status, Refresh & No-Show Workflow

### How status is calculated
Status is automatic, based on dates plus manual flags:

- **PENDING** — the work date hasn't arrived yet (tickets clear at 11:59 PM on the work date; first dig day is the day after).
- **VALID** — active and safe to dig.
- **EXTENDABLE** — within **3 days** of expiration (the refresh window).
- **REFRESH_NEEDED** — someone requested a refresh (manual flag).
- **EXPIRED** — past the expiration date, or — if work hasn't begun — past the **dig-by date** (call-in date + 10 days by default).

### Work-begun confirmation
The app prompts crews to confirm whether **work has begun** on a ticket. Answering changes how expiration is computed (a started dig follows the `expires` date; an un-started one is bound by the dig-by date). You can **snooze** a single prompt or **snooze all**.

### Request a refresh
1. On a ticket row, click the **Refresh** (amber) button.
2. The ticket is flagged **REFRESH_NEEDED**, and an **email alert** is automatically sent to all admins/recipients configured with a notification email.
3. Click the button again to **clear** the request (confirmation required).

### Log a No-Show
When a utility fails to mark by the work date:
1. Open the **No-Show** form for the ticket.
2. Select the **utilities** that didn't show (All / Power / Gas / Telecom / City-Village / Private) and note the responsible company.
3. Save. The ticket is tagged as a **No Show** (counted in the stat card) and the record is timestamped with your name. You can delete the record later if the utility shows up.

### Ticket notes
Open a ticket's **Notes** to add timestamped, attributed comments visible to the team — useful for field updates and coordination.

---

## 6. Schedule (Calendar)

The **Schedule** tab is a calendar view of your tickets by date.

- See tickets laid out on their **work dates**, color-coded by status.
- Click a ticket to **edit** it, **view its document**, **jump to it in the dashboard**, or **manage a no-show**.
- Great for planning the week and spotting clustered or expiring work.

---

## 7. Map

The **Map** tab plots tickets geographically (Leaflet/OpenStreetMap).

- Tickets with coordinates (captured during AI scanning or geocoding) appear as **pins**; dig **bounding boxes** are drawn when available.
- Click a pin to see ticket details and open its document.
- Use it to see how jobs cluster and route crews efficiently.

> Inventory/equipment has its own dedicated map inside the Inventory module (see §15).

---

## 8. Field Docs (Photos & Documents)

The **Field Docs** tab is your photo and document hub, organized by job.

### Steps
1. Pick (or search for) a **job**.
2. **Upload** photos/documents — drag-and-drop or use the device camera. Files queue and upload with progress.
3. Add a **caption** to each item; everything is timestamped.
4. Browse a job's gallery, view full-size, and (admins) delete items or whole jobs' doc sets.

Use this for site conditions, damage documentation, completed work, and any field paperwork.

---

## 9. Jobs

The **Jobs** tab reviews work organized by job rather than by ticket.

- See each job's customer, address, and roll-up of its tickets/status.
- Open a **job summary**, jump to its tickets, or view associated documents.
- Admins can mark jobs complete (completed jobs drop off the active ticket dashboard).

---

## 10. Documents & PDF Markup (in the Job Hub)

Job **prints** (plan PDFs) live in the **Jobs** tab: select a job and use its **Documents & Prints** panel — turning plans into red-lined as-builts.

### Manage prints
1. Select a job in the Job Hub (search by job number, name, or city).
2. **Upload** a plan PDF from the Documents & Prints panel.
3. Each PDF offers **Markup** (open the annotation editor), **View** (open in a new tab), and **Download**.
4. **Download** lets you choose the **Original PDF** or a copy **With Markup** — the saved annotations burned into every page.

### Mark up a print (PDF Markup Editor)
Hit **Markup** on a print to launch the full annotation editor. Tools include:

- **Navigation:** Select, Pan
- **Freehand:** Pen, Highlighter
- **Text:** Text, Callout, and **Stamps** (`APPROVED`, `REVISED`, `FIELD CHANGE`, `AS BUILT`, `NOT APPROVED`, `VOID` — each color-coded)
- **Lines & arrows:** Arrow, Double-arrow, Line, Dashed line, **Dimension**
- **Shapes:** Rectangle / filled, Circle / filled, **Cloud** (revision cloud)
- **Scale:** set a drawing scale so dimension annotations read in real-world units
- Per-annotation **color** and **stroke width**

Annotations are saved per page with your name and timestamp, so the whole team sees the same marked-up set. You can also drop **ticket markers** onto a print to tie a locate ticket to a spot on the plan.

---

## 11. Crew / Team Management

The **Crew** tab is where admins manage people and company settings. (Crew members see a read-only version.)

### Manage users (Admin)
- **Add a user** directly, or **generate an invite link** to send.
- **Change roles** (promote/demote between CREW and ADMIN).
- **Edit a user's display name.**
- **Send a password reset** email to a user; update **your own** password.
- **Remove** a user from the company.

### Notification recipients
- Set **per-user notification emails** so the right people receive refresh/no-show alerts.
- Use **Test Email** to confirm alerts are being delivered.

### Company & module settings (Admin)
From here admins toggle the **optional modules** for the company:
- **Inbound Tickets**
- **Field Ops (Scheduling)**
- **Time Tracker**
- **Inventory**

### Super Admin
A **SUPER_ADMIN** additionally sees a company-management panel to **create companies**, **activate/deactivate** them, and toggle **each company's** modules — useful for running DigTrack Pro across multiple organizations.

---

## 12. Optional Module: Inbound Tickets

*Enable via Crew → company settings (admin). Adds an inbound dispatch workflow for tickets that come **in** to your shop (e.g. you are the locating company).*

### Dispatcher view (Inbound Tickets Dashboard)
- See all inbound tickets with **urgency filters** (All / Overdue / Today / This week) and sorting by due date, dig start, address, or assignee.
- A **Live Activity** panel shows who is currently **clocked in** on which ticket, in real time.
- **Create** an inbound ticket: ticket number, site address, dig start & due dates, caller name/phone, utility types, and notes.
- **Assign** a ticket to a technician — its status moves `unassigned → assigned`.

### Technician view (Tech Queue)
- Each tech sees **their queue** of assigned inbound tickets.
- Open a ticket to see full details, **clock in / clock out** against it (status moves to `in_progress`, then `completed`), and add **photos** and **notes** from the field.

### Inbound calendar & map
- **Inbound Calendar** lays inbound tickets out by date.
- **Inbound Map** plots inbound site addresses geographically.

---

## 13. Optional Module: Field Ops (Scheduling)

*Enable via company settings. A dispatch board for crews, equipment, and materials, with work logs and invoicing.*

The **Field Ops** tab has four sub-tabs:

### Board
- A **Gantt-style dispatch board**: schedule blocks for crews against jobs across a timeline.
- Your existing DigTrack jobs are auto-offered as schedulable jobs (you can also add ad-hoc ones).

### Resources
- Manage **Employees** (name, role, hourly rate; optionally linked to a login and flagged as **foreman**).
- Manage **Equipment** (unit number, type, make/model, VIN, hourly rate) and **Materials** (unit price).

### Logs (Work Logs)
- Record daily **work logs** per job: hours by employee, hours by equipment, and materials consumed — each with rates for accurate costing.
- Import logs in bulk via the **CSV import** tool.

### Invoices
- Roll work logs into an **invoice** for a job and **export it to PDF** (built-in PDF generator) to send to the customer.

---

## 14. Optional Module: Time Tracker

*Enable via company settings. Job-costed clock in/out for the field, with admin approval.*

The **Time** tab has three sub-tabs:

### Clock
1. A worker selects a **job** (dig jobs **and** Field Ops service jobs are merged into one searchable list) and a **cost code**.
2. **Clock in** — optionally captures **GPS** location; **clock out** when done. Add a note.
3. **Foreman crews:** a foreman (a flagged employee with a login) can save a **personal crew** and **clock the whole crew in/out at once** — handy when crew members don't have their own logins.

### Codes (Cost Codes) — Admin
- Create and manage **cost codes** (code + description, active/inactive) used to categorize labor hours.

### Timesheets — Admin
- Review all time entries, see totals by job/code/employee, and **approve** entries (approval is tracked with approver and timestamp). Approved time feeds your job costing.

---

## 15. Optional Module: Inventory

*Enable via company settings. Track equipment and materials, where they are, and who has them.*

The **Inventory** tab has three sub-tabs plus an equipment map:

### Items
- Add **Equipment** (unit number, type, year/make/model, serial, VIN, license plate, asset tag, odometer, service dates, hourly rate) or **Materials** (quantity + unit).
- Move items with tracked **movements**:
  - **Check Out / Check In** (to/from a location)
  - **Transfer** (location → location)
  - **Assign / Return** (to/from a person)
  - **Consume** (draw down material quantity)
- Each item shows its **current location, job, or assignee** at a glance.

### Locations
- Define **shop/yard locations** with full street/city/state/zip; the app **geocodes** them so they appear on the map.

### History
- A full, timestamped **audit trail** of every movement — type, item, who performed it, from/to, job, quantity change, and notes — color-coded by movement type.

### Equipment Map
- A geographic view that plots equipment and materials at their **current location** — whether a shop or a **job site** — collapsing multiple items at one place into a single marker so pins never stack. Great for "where is everything right now?"

---

## 16. Settings, Notifications & Branding

- **Branding:** the company **brand color** chosen at registration themes the entire UI; the company name shows in the header. Admins can update company details (name, city, state, phone).
- **Email alerts:** refresh requests (and other key events) email everyone with a configured **notification email**. Set these per user in **Crew**, and verify delivery with **Test Email**.
- **Module toggles:** admins switch Inbound, Field Ops, Time, and Inventory on/off per company; super admins do this across all companies.
- **Dark/Light mode:** per-device preference, remembered between sessions.

---

## 17. Mobile & Offline

- DigTrack Pro is a **Progressive Web App (PWA)** — install it to your phone's home screen for an app-like experience, with a service worker for offline resilience.
- **Camera access** is supported for scanning tickets and capturing field photos directly.
- **Customizable mobile tabs:** on phones you can choose which views appear as your **primary bottom tabs** (defaults to Tickets, Map, Field Ops) so your most-used tools are one tap away.

---

## Quick Reference — Where do I…?

| I want to… | Go to |
|------------|-------|
| Scan/enter a locate ticket | **Tickets → Add Ticket** |
| See what's expiring | **Tickets** stat cards / **Schedule** |
| Request a refresh or log a no-show | **Tickets** row actions |
| See tickets on a map | **Map** |
| Upload site photos | **Field Docs** |
| Red-line or download a plan PDF | **Jobs → Documents & Prints** |
| Add a teammate / send an invite | **Crew** |
| Dispatch incoming locate requests | **Inbound** *(if enabled)* |
| Schedule crews & invoice work | **Field Ops** *(if enabled)* |
| Clock in / approve timesheets | **Time** *(if enabled)* |
| Track equipment & materials | **Inventory** *(if enabled)* |

---

*DigTrack Pro — built for excavation and utility crews to keep every dig legal, documented, and on schedule.*
