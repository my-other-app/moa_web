# Changelog

What changed in the club dashboard (club-dashboard.myotherapp.in), written for club organisers and their teams, with a short note on the admin portal for platform admins.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The dashboards go live continuously, so each section is the date a set of changes went live.

## 2026-11-21 - DevFest release

Releasing today, 21 November 2026.

### Added

- **Quests** (Event → Quests). Set up tasks, milestones and swag rewards for your guests. Quests are off by default for every event.
- Build tasks from templates: check-in, meeting people by QR in the app, the quiz, polls, questions, feedback, posters, following the club, completing a profile, visiting a station, secret codes, or marked done by you. Each task has its own points, hours and a "required" option.
- Secret codes, with a printable code sheet. You can replace a code at any time.
- Milestones give rewards from the event's swag, with stock by size. When stock runs out, choose first come, first served or a waiting list.
- **Stations and swag desks** on the door console. Scanning a ticket at a station records a visit, even offline. Scanning at a swag desk shows the guest's rewards to hand over.
- While a quest runs: live numbers, each guest's progress, grant or revoke a task with a reason, a log of changes, and an export of who earned what to Excel or CSV.
- **"I'm attending" posters** (Event → Posters). Turn posters on, set the phrase and caption for before, during and after the event, and choose which formats guests may pick.
- See the posters made and shared, the clicks on their links, and the registrations they brought in.
- Poster designs on the design board, for everyone or for each role or ticket type, in square, portrait and story.
- **The live room's look** (the Look tab in the live console). Start from a preset, then set the colours, logo, background, fonts, answer style, timer, leaderboard and a sponsor strip.
- A live preview shows the big screen and a phone side by side. Colours that would be hard to read are refused before they reach the projector.
- Big screen controls: choose what it shows (the quiz, a poll, the Q&A wall, slides or the leaderboard), run updates as a ticker, and show slides between items.
- **Quiz rounds**: several rounds per event, each with its own rules for points, speed bonus, points lost for wrong answers, streaks, ties, moving on by itself, and teams.
- New question kinds: several right answers, true or false, type the answer, put in order, and poll questions. Pause, skip, reveal and ask again while a round runs.
- Export a round's winners, or mark them as the event's winners so certificates follow.
- More poll kinds: pick several, ratings, ranking and open text (approved before it shows), with results as bars, columns or a donut.
- The confirm page now shows an AI assistant's requests to issue certificates or to send a review email again, so you can check and approve them from your phone.

### Fixed

- The door console failed to open for some events. It opens again.
- The door console and the kiosk stay open when one update fails, for example on weak Wi-Fi.
- After a card prints at check-in, the door and the kiosk offer to print it "again", instead of offering a first print.

### Security

- Updated the dashboards' web framework to Next.js 16.4.6 to fix security issues.

## 2026-11-16

### Added

- Event → Tickets: copy the link for each hidden ticket type, such as comp, speaker or staff tickets. You can also copy it from the event's settings.

Behind the scenes: groundwork for stricter security settings.

## 2026-11-15

### Changed

- An expired session renews by itself. If you do have to sign in again, the editors warn you before any unsaved work is lost.
- Uploads can be up to 9 MB, and a file that is too large gets a clear message.
- Door screens handle guests' contact details shown partly hidden, and search starts from three characters.

### Security

- Fixed security issues in picture handling and in the website editor's preview.

## 2026-11-14

### Added

- A networking card on an event's Overview and Check-ins pages: people networked, saves and mutual pairs. It shows counts only, never names.
- A personal QR code you can add to ID card designs, so guests can save each other from their badges.
- Admin portal: reported profiles in the reports queue, and a networking summary.

### Fixed

- The door console keeps saved scans that the server asks to receive again, and keeps retrying them.
- A request that hangs now stops with a clear message instead of waiting forever.

### Security

- Fixed a security issue in how the dashboards handle requests from other sites.

## 2026-11-13

### Added

- **Website editor for ten new templates**: reorder or hide sections, a photo library of up to 20 photos, picture slots, your own line for the Join section, and a live preview on desktop and mobile.
- Edit details for people under review or on the waiting list: name, email, phone and their answers. Nothing is decided or emailed.
- Sort menus on Review, the guest list, the waiting list, contacts, certificates and store orders. The message log can show newest or oldest first.
- Clubs see the address reserved for them.
- Admin portal: Mail, the platform's own inbox, and changing club and event web addresses (old addresses keep working) and club mail addresses.
- Admin portal: correct a guest's details without signing in as the club, and sort more lists by column.

### Changed

- Club mailbox addresses are now yourclub@myotherapp.in.

### Fixed

- On events that review registrations, the Emails page no longer warns wrongly that tickets go out without your design.

## 2026-11-12

### Added

- **Promote**: connect the club's Instagram, Facebook, LinkedIn and X accounts, plan posts for an event, approve them, and see registrations per platform.
- **Help** in the club dashboard. Admin portal: Team work, with a support desk and sales leads.
- **Speakers**: add a past speaker to an event in a few clicks, with a talk title. Admin portal: the speakers directory, with merging duplicates and invites to claim a profile.
- A setting that lets attendees give back a free ticket, and a "Given back" list on the Attendees tab.
- **Integrations** (Settings → Integrations, for clubs with API access): API keys, webhooks with a delivery log, connected apps, usage, and links to the developer docs.
- Admin portal: decide which clubs get API access, register partner apps, and watch webhook health.
- **35 new designs** for tickets, ID cards and certificates, in a gallery, with settings for colour, wording, signatories and fields, and a live preview.
- **The design board**: move and change every part of a ticket, ID card or certificate.

## 2026-11-11

### Added

- Event → Emails: give an event its own words for each of the six registration review emails, and send an edited email again to the people who already got it.

## 2026-11-10

### Added

- Every export can be downloaded as Excel as well as CSV.

### Fixed

- Registration answers on Review and in a guest's details are easy to read. Long questions no longer overlap the answers.

## 2026-11-08

### Added

- **Conditional registration questions**: show a question only when an earlier answer matches, nested as deep as you need.
- **Missing answers**: when you change the questions on a live event, see who is affected before you save, then ask those people for the missing answers and track who has replied.

### Changed

- Door staff no longer see exports or discount codes.
- Without signal, the dashboard's door console refuses codes that are not tickets and repeat scans, and marks other tickets "Unverified" so you check the person's name or ID.

### Security

- Signing out now ends your session on the server too, along with other security improvements.

## October 2026

The club dashboard and the admin portal were rebuilt as one set of apps, with a new look in light and dark.

### Added

- **The event console**: a door console with doors and a door team, the check-in log, a kiosk screen, ID cards printed at the door, admission numbers, the run of show, merchandise handed over at the door, and a closeout report.
- A designer for tickets and certificates on the event itself, with a preview for a real attendee.
- A delivery log for emails and messages.
- **The live room**: the Live tab, the big screen and a present view for the projector, with quiz, Q&A and polls.
- Club tools: tracking links, finance for the season and each event, the club profile, Threads, followers, announcements, emails, a Competition tab and a Security page.
- Your club's website from a template, on your own domain if you like.
- Team access, with a login and a role for each person.
- A venue picker with a map pin.
- **Ticketing**: ticket types, discount codes and waiting lists, cancelling an event with refunds, and naming winners.
- Confirm each registration on a Requests tab, with bulk confirm and decline, and editable review emails.
- Co-hosted events, sponsors and partners on events, and merchandise kept as a club catalogue.
- **Plans**: club sign-up, Plan and billing, a free trial, prepaid credits, and message usage and limits.
- Payments into the club's own Razorpay account, WhatsApp for Enterprise clubs, and a club mailbox.
- **AI assist**: draft an event from a poster, Write with AI, a feedback summary, your own AI key, and approving requests from connected AI apps.
- Continue with Google, two-factor sign-in with a QR code, recovery codes, and password reset.
- Admin portal: reports and moderation, plans and billing, payment gateways, club domains, topics, payouts, disputes and refunds, admin accounts with two-factor sign-in, and registrations under review.

## Earlier

Before October 2026, the club dashboard and the admin portal were separate apps, used to publish events and manage registrations and clubs.
