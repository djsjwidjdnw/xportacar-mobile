# XportACar — Buyer mobile app

React-Native / Expo companion to the XportACar web platform.  Buyers can
browse the marketplace, view vehicle details, bid in live auctions, manage
their watchlist, and review their bid history — all backed by the same
Supabase project the web app uses.

**Stack:** Expo 54 · React Native 0.81 · TypeScript · Supabase JS ·
React Navigation (native-stack + bottom-tabs) · expo-image ·
expo-secure-store · expo-notifications.

## Screens

| Screen | Purpose |
|--------|---------|
| `Login`           | Email + password sign-in via Supabase Auth |
| `Register`        | Create trade account (role=buyer, kyc=pending) |
| `Marketplace`     | Card list, live-countdown badges, full-text search |
| `VehicleDetail`   | Photo carousel, specs, features, condition report |
| `Auction`         | Bid panel with increment ladder, Buy Now, **Supabase Realtime** bid history |
| `MyBids`          | Top-bid-per-auction list with Winning / Outbid / Won tags |
| `Watchlist`       | Saved vehicles, pull-to-refresh |
| `Profile`         | View + edit profile, sign out |

## Getting started

```bash
npm install
npx expo start
```

The `extra.supabaseUrl` / `extra.supabaseAnonKey` in `app.json` already point
at the shared XportACar Supabase project.  Override per-environment with the
standard Expo env mechanism if you need to.

### Demo credentials

Use any of the seeded buyers:

| Email                       | Password    |
|-----------------------------|-------------|
| buyer@xportacar.com         | Demo!1234   |
| buyer2@xportacar.com        | Demo!1234   |
| buyer3@xportacar.com        | Demo!1234   |

### Build for stores

```bash
# EAS — configure once with: eas init && eas build:configure
eas build -p ios     --profile production
eas build -p android --profile production
```

`bundleIdentifier` / `package`: `com.xportacar.app`.

## Push notifications

`src/lib/push.ts` requests permission on sign-in, fetches an Expo push
token, and POSTs it to the web app's `/api/push-tokens` endpoint
(authenticated via the Supabase session) which writes to `push_tokens` in
Postgres.  The web app fans-out outbid + auction-won notifications via the
Expo Push API.

## Notes

- Tokens are persisted in `expo-secure-store` (keychain / EncryptedSharedPreferences).
- Realtime bid updates use `supabase.channel("auction-{id}")` listening
  to `INSERT` on `bids` and `UPDATE` on `auctions`.
- The auction screen ticks every second to keep the countdown live;
  the marketplace card relies on its own re-render cycle.
- All the SOW field-team workflows (inspections, photo capture etc.)
  live in the separate
  [`xportacar-inspection`](https://github.com/djsjwidjdnw/xportacar-inspection)
  Expo app.
