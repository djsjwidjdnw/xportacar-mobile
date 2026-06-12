// Lightweight i18n for the mobile app.
// - Strings live in this file (subset of the web translations).
// - The active locale is fed from the signed-in user's profile.language
//   via I18nProvider in App.tsx, with a SecureStore fallback for guests.
// - setLocale updates state synchronously (instant re-render across all
//   screens) AND persists to both SecureStore and the user profile.

import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { I18nManager } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";
import { supabase } from "./supabase";

export type Locale = "en" | "de" | "ar" | "fr";
export const SUPPORTED: Locale[] = ["en", "de", "ar", "fr"];
const STORE_KEY = "xpc_locale";

type Dict = Record<string, string>;

const en: Dict = {
  // Navigation tabs / stack headers
  "nav.marketplace": "Marketplace",
  "nav.auctions":    "Live Auctions",
  "nav.live":        "Live",
  "nav.myBids":      "My Bids",
  "nav.watchlist":   "Watchlist",
  "nav.profile":     "Profile",
  "nav.vehicle":     "Vehicle",
  "nav.auction":     "Auction",
  "nav.auctionWon":  "You Won",
  "nav.signOut":     "Sign out",

  "live.title":       "Live Auctions",
  "live.subtitle":    "Bid right now on cars ending soon.",
  "live.empty":       "No live auctions at the moment. Check back soon.",
  "live.endingSoon":  "Ending soonest first",

  "vehicle.scheduled":  "Starts {when}",
  "vehicle.scheduledShort": "Scheduled",
  "vehicle.shipping":   "Shipping & Delivery",
  "vehicle.shippingNote": "Estimates · door-to-port from Jebel Ali, Dubai",
  "vehicle.buyNowFull": "Buy now {price}",

  "auth.welcomeBack":   "Welcome back",
  "auth.signInBlurb":   "Sign in to bid on premium UAE-sourced vehicles.",
  "auth.email":         "Email",
  "auth.password":      "Password",
  "auth.signIn":        "Sign in",
  "auth.signingIn":     "Signing in…",
  "auth.createAccount": "Create a trade account",
  "auth.openTrade":     "Open a trade account",
  "auth.twoMinutes":    "Two minutes. Approved within a day.",
  "auth.fullName":      "Full name",
  "auth.company":       "Company",
  "auth.country":       "Country",
  "auth.creating":      "Creating…",
  "auth.backToSignIn":  "Back to sign in",
  "auth.weakPwd":       "Use at least 8 characters.",
  "auth.missing":       "Enter your email and password.",

  "marketplace.title":     "Marketplace",
  "marketplace.search":    "Search make, model, VIN…",
  "marketplace.results":   "{count} of {total} vehicles",
  "marketplace.empty":     "No vehicles match your search.",
  "marketplace.allTab":    "All Vehicles",
  "marketplace.liveTab":   "Live Now",
  "marketplace.liveCount": "{count} live · ending soonest first",
  "marketplace.heroEyebrow":   "UAE → EUROPE",
  "marketplace.heroTitle":     "Premium GCC Vehicles",
  "marketplace.heroSub":       "Inspected. Auctioned. Delivered to Europe.",
  "marketplace.heroVehicles":  "vehicles",
  "marketplace.heroLiveNow":   "live now",
  "marketplace.noLiveTitle":   "No live auctions",
  "marketplace.noLiveBody":    "Nothing live right now. Switch to All Vehicles to see what's coming soon.",
  "marketplace.noMatches":     "No matches",

  "vehicle.specs":         "Specifications",
  "vehicle.features":      "Features & equipment",
  "vehicle.condition":     "Condition report",
  "vehicle.noDamage":      "No reported damage. Inspected and certified.",
  "vehicle.sellerNotes":   "Seller notes",
  "vehicle.viewAuction":   "View auction",
  "vehicle.loading":       "Loading vehicle…",
  "vehicle.notFound":      "Vehicle not found.",
  "vehicle.startingPrice": "Starting price",
  "vehicle.finalPrice":    "Final price",
  "vehicle.listedPrice":   "Listed price",
  "vehicle.viewInvoice":   "View Invoice",
  "vehicle.viewResult":    "View result",
  "vehicle.bidNow":        "Bid Now",
  "vehicle.buyNowPrice":   "Buy Now {price}",
  "vehicle.shippingChoose":"Choose how the vehicle reaches you. Prices reflect the selected currency.",
  "vehicle.totalEstimate": "Total estimate",
  "vehicle.totalBreakdown":"{price} vehicle + {shipping} {method}",
  "vehicle.specVin":          "VIN",
  "vehicle.specMileage":      "Mileage",
  "vehicle.specFuel":         "Fuel",
  "vehicle.specTransmission": "Transmission",
  "vehicle.specBody":         "Body",
  "vehicle.specExterior":     "Exterior",
  "vehicle.specInterior":     "Interior",
  "vehicle.specListedPrice":  "Listed price",

  "auction.currentBid":    "Current bid",
  "auction.yourBid":       "Your bid",
  "auction.minBid":        "Min next bid: {price}",
  "auction.placeBid":      "Place bid",
  "auction.placing":       "Placing…",
  "auction.ended":         "Auction ended",
  "auction.bidsBidders":   "{bids} bids · {bidders} bidders",
  "auction.history":       "Bid history",
  "auction.noBids":        "No bids yet.",
  "auction.winning":       "You're winning!",
  "auction.outbid":        "You've been outbid",
  "auction.outbidBody":    "New top bid {price}",
  "auction.buyNow":        "Buy now · {price}",
  "auction.buyNowQ":       "Buy now?",
  "auction.buyNowConfirm": "Yes, buy",
  "auction.buyWonTitle":   "You won!",
  "auction.buyWonBody":    "Our team will follow up.",
  "auction.loading":             "Loading auction…",
  "auction.notFound":            "Auction not found.",
  "auction.signInRequired":      "Sign in required",
  "auction.signInToBid":         "Sign in to place a bid.",
  "auction.bidTooLow":           "Bid too low",
  "auction.bidTooLowBody":       "Min next bid is {price}.",
  "auction.proxyTooLow":         "Proxy too low",
  "auction.proxyTooLowBody":     "Maximum bid must be at least your current bid amount.",
  "auction.bidFailed":           "Bid failed",
  "auction.tryAgain":            "Something went wrong. Please try again.",
  "auction.proxyPlacedTitle":    "Proxy bid placed",
  "auction.proxyPlacedBody":     "We'll auto-bid on your behalf in €500 increments up to {max}.",
  "auction.purchaseFailed":      "Couldn't complete purchase",
  "auction.setMaxBid":           "Set maximum bid",
  "auction.proxyHint":           "We'll bid on your behalf in €500 increments up to {max}. Other bidders won't see your limit.",
  "auction.youLabel":            "You",
  "auction.bidderLabel":         "Bidder #{id}",
  "auction.topBid":              "Top bid",
  "auction.proxyTag":            " · proxy",
  "auction.buyNowBody":          "You'll purchase {vehicle} for {price}. The auction closes immediately.",
  "auction.cancel":              "Cancel",

  "bids.title":      "My bids",
  "bids.empty":      "No bids yet — browse the marketplace.",
  "bids.won":        "Won",
  "bids.ended":      "Ended",
  "bids.winning":    "Winning",
  "bids.outbid":     "Outbid",
  "bids.topAndCurr": "Your top {top} · Current {current}",
  "bids.signInTitle":"Sign in to track your bids",
  "bids.signInBody": "Create an account or log in to see auctions you're bidding on.",
  "bids.loading":    "Loading your bids…",
  "bids.emptyTitle": "No bids yet",
  "bids.emptyBody":  "You haven't placed any bids yet. Explore live auctions to get started.",
  "bids.viewInvoice":"View Invoice & Payment",

  "watchlist.title": "Watchlist",
  "watchlist.empty": "No vehicles on your watchlist yet.",
  "watchlist.signin": "Sign in to use your watchlist.",
  "watchlist.added":   "Added to watchlist",
  "watchlist.removed": "Removed from watchlist",
  "watchlist.loading":      "Loading watchlist…",
  "watchlist.savedCount":   "{count} saved",
  "watchlist.errLoad":      "Couldn't load watchlist: {error}",
  "watchlist.signInTitle":  "Sign in to save vehicles",
  "watchlist.emptyTitle":   "Your watchlist is empty",
  "watchlist.emptyBody":    "No vehicles saved yet. Browse the marketplace to find your next purchase.",
  "watchlist.cantUpdate":   "Couldn't update watchlist",
  "watchlist.signInRequired":"Sign in required",

  "profile.title":      "Profile",
  "profile.section":    "Account details",
  "profile.save":       "Save changes",
  "profile.saving":     "Saving…",
  "profile.saved":      "Profile updated.",
  "profile.kycOK":      "KYC verified",
  "profile.kycPending": "KYC pending",
  "profile.kycRej":     "KYC rejected",
  "profile.signin":     "Sign in to view your profile.",
  "profile.phone":      "Phone",
  "profile.language":   "Language",
  "profile.memberSince":"Member since {date}",
  "profile.myBids":     "My Bids",
  "profile.seeAll":     "See All",
  "profile.noBids":     "No bids yet. Browse live auctions to get started.",
  "profile.wonAuctions":"Won auctions",
  "profile.wonAt":      "Won at {price}",
  "profile.yourBid":    "Your bid",
  "profile.current":    "Current",
  "profile.viewAuction":"View auction",

  "deleteAccount.button":        "Delete account",
  "deleteAccount.title":         "Delete account",
  "deleteAccount.warning":       "This will permanently delete your account and all associated data.",
  "deleteAccount.loseIntro":     "You will lose:",
  "deleteAccount.loseBids":      "Your bids and watchlist",
  "deleteAccount.loseInvoices":  "Access to past invoices",
  "deleteAccount.cannotUndo":    "This action cannot be undone.",
  "deleteAccount.typeToConfirm": "Type DELETE to confirm.",
  "deleteAccount.confirm":       "Delete my account",
  "deleteAccount.deleting":      "Deleting…",
  "deleteAccount.cancel":        "Cancel",
  "deleteAccount.success":       "Your account has been deleted.",
  "deleteAccount.failed":        "Couldn't delete your account. Please try again.",

  // Won screen
  "won.title":          "Congratulations!",
  "won.subtitle":       "You won this auction.",
  "won.closed":         "This auction has closed.",
  "won.invoice":        "Invoice",
  "won.hammer":         "Hammer price",
  "won.platformFee":    "Platform fee (2.9%)",
  "won.totalDue":       "Total due",
  "won.deadlineEyebrow":"Payment due within 5 working days",
  "won.paymentTitle":   "Payment instructions",
  "won.paymentBody":    "Wire transfer to Bradshaw Automation within 5 working days. Shipping or warehouse pickup begins upon payment confirmation.",
  "won.bankDetails":    "Bank details will be sent to your registered email",
  "won.share":          "Share invoice summary",
  "won.backMarket":     "Back to marketplace",
  "won.viewVehicle":    "View vehicle",

  // Order-status timeline (sold → picked_up → in_transit → delivered)
  "timeline.orderStatus": "Order status",
  "timeline.sold":        "Sold",
  "timeline.pickedUp":    "Picked Up",
  "timeline.inTransit":   "In Transit",
  "timeline.delivered":   "Delivered",
};

const de: Dict = {
  "nav.marketplace": "Marktplatz",
  "nav.auctions":    "Live-Auktionen",
  "nav.live":        "Live",
  "nav.myBids":      "Meine Gebote",
  "nav.watchlist":   "Merkliste",
  "nav.profile":     "Profil",
  "nav.vehicle":     "Fahrzeug",
  "nav.auction":     "Auktion",
  "nav.auctionWon":  "Gewonnen",
  "nav.signOut":     "Abmelden",

  "live.title":      "Live-Auktionen",
  "live.subtitle":   "Biete jetzt auf bald endende Fahrzeuge.",
  "live.empty":      "Aktuell keine Live-Auktionen.",
  "live.endingSoon": "Endet zuerst",

  "vehicle.scheduled":  "Startet {when}",
  "vehicle.scheduledShort": "Geplant",
  "vehicle.shipping":   "Versand & Lieferung",
  "vehicle.shippingNote": "Schätzungen · von Jebel Ali, Dubai",
  "vehicle.buyNowFull": "Sofort kaufen {price}",

  "auth.welcomeBack":   "Willkommen zurück",
  "auth.signInBlurb":   "Melde dich an, um auf VAE-Fahrzeuge zu bieten.",
  "auth.email":         "E-Mail",
  "auth.password":      "Passwort",
  "auth.signIn":        "Anmelden",
  "auth.signingIn":     "Anmelden…",
  "auth.createAccount": "Händlerkonto erstellen",
  "auth.openTrade":     "Händlerkonto eröffnen",
  "auth.twoMinutes":    "Zwei Minuten. In einem Tag freigeschaltet.",
  "auth.fullName":      "Vollständiger Name",
  "auth.company":       "Firma",
  "auth.country":       "Land",
  "auth.creating":      "Erstellen…",
  "auth.backToSignIn":  "Zurück zur Anmeldung",
  "auth.weakPwd":       "Mindestens 8 Zeichen.",
  "auth.missing":       "E-Mail und Passwort eingeben.",

  "marketplace.title":  "Marktplatz",
  "marketplace.search": "Marke, Modell oder VIN suchen…",
  "marketplace.results":"{count} von {total} Fahrzeugen",
  "marketplace.empty":  "Keine Fahrzeuge gefunden.",
  "marketplace.allTab": "Alle Fahrzeuge",
  "marketplace.liveTab":"Jetzt Live",
  "marketplace.liveCount":"{count} live · endet zuerst",
  "marketplace.heroEyebrow":   "VAE → EUROPA",
  "marketplace.heroTitle":     "Premium-Golfstaaten-Fahrzeuge",
  "marketplace.heroSub":       "Inspiziert. Versteigert. Geliefert nach Europa.",
  "marketplace.heroVehicles":  "Fahrzeuge",
  "marketplace.heroLiveNow":   "jetzt live",
  "marketplace.noLiveTitle":   "Keine Live-Auktionen",
  "marketplace.noLiveBody":    "Aktuell nichts live. Wechsle zu „Alle Fahrzeuge“.",
  "marketplace.noMatches":     "Keine Treffer",

  "vehicle.specs":      "Technische Daten",
  "vehicle.features":   "Ausstattung",
  "vehicle.condition":  "Zustandsbericht",
  "vehicle.noDamage":   "Keine gemeldeten Schäden.",
  "vehicle.sellerNotes":"Verkäufernotizen",
  "vehicle.viewAuction":"Zur Auktion",
  "vehicle.loading":       "Fahrzeug wird geladen…",
  "vehicle.notFound":      "Fahrzeug nicht gefunden.",
  "vehicle.startingPrice": "Startpreis",
  "vehicle.finalPrice":    "Endpreis",
  "vehicle.listedPrice":   "Listenpreis",
  "vehicle.viewInvoice":   "Rechnung ansehen",
  "vehicle.viewResult":    "Ergebnis ansehen",
  "vehicle.bidNow":        "Jetzt bieten",
  "vehicle.buyNowPrice":   "Sofort kaufen {price}",
  "vehicle.shippingChoose":"Wähle, wie das Fahrzeug zu dir kommt. Preise in der gewählten Währung.",
  "vehicle.totalEstimate": "Gesamtkostenschätzung",
  "vehicle.totalBreakdown":"{price} Fahrzeug + {shipping} {method}",
  "vehicle.specVin":          "VIN",
  "vehicle.specMileage":      "Kilometerstand",
  "vehicle.specFuel":         "Kraftstoff",
  "vehicle.specTransmission": "Getriebe",
  "vehicle.specBody":         "Karosserie",
  "vehicle.specExterior":     "Außenfarbe",
  "vehicle.specInterior":     "Innenraum",
  "vehicle.specListedPrice":  "Listenpreis",

  "auction.currentBid": "Aktuelles Gebot",
  "auction.yourBid":    "Dein Gebot",
  "auction.minBid":     "Min. nächstes Gebot: {price}",
  "auction.placeBid":   "Gebot abgeben",
  "auction.placing":    "Wird gesendet…",
  "auction.ended":      "Auktion beendet",
  "auction.bidsBidders":"{bids} Gebote · {bidders} Bieter",
  "auction.history":    "Gebotsverlauf",
  "auction.noBids":     "Noch keine Gebote.",
  "auction.winning":    "Du führst!",
  "auction.outbid":     "Du wurdest überboten",
  "auction.outbidBody": "Neues Höchstgebot {price}",
  "auction.buyNow":     "Sofort kaufen · {price}",
  "auction.buyNowQ":    "Sofort kaufen?",
  "auction.buyNowConfirm":"Ja, kaufen",
  "auction.buyWonTitle":"Du hast gewonnen!",
  "auction.buyWonBody": "Unser Team meldet sich.",
  "auction.loading":             "Auktion wird geladen…",
  "auction.notFound":            "Auktion nicht gefunden.",
  "auction.signInRequired":      "Anmeldung erforderlich",
  "auction.signInToBid":         "Melde dich an, um zu bieten.",
  "auction.bidTooLow":           "Gebot zu niedrig",
  "auction.bidTooLowBody":       "Mindestens nächstes Gebot ist {price}.",
  "auction.proxyTooLow":         "Proxy zu niedrig",
  "auction.proxyTooLowBody":     "Das Maximalgebot muss mindestens deinem aktuellen Gebot entsprechen.",
  "auction.bidFailed":           "Gebot fehlgeschlagen",
  "auction.tryAgain":            "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
  "auction.proxyPlacedTitle":    "Proxy-Gebot abgegeben",
  "auction.proxyPlacedBody":     "Wir bieten für dich in 500€-Schritten bis zu {max}.",
  "auction.purchaseFailed":      "Kauf konnte nicht abgeschlossen werden",
  "auction.setMaxBid":           "Maximalgebot festlegen",
  "auction.proxyHint":           "Wir bieten für dich in 500€-Schritten bis zu {max}. Andere Bieter sehen dein Limit nicht.",
  "auction.youLabel":            "Du",
  "auction.bidderLabel":         "Bieter #{id}",
  "auction.topBid":              "Höchstgebot",
  "auction.proxyTag":            " · Proxy",
  "auction.buyNowBody":          "Du kaufst {vehicle} für {price}. Die Auktion wird sofort beendet.",
  "auction.cancel":              "Abbrechen",

  "bids.title":         "Meine Gebote",
  "bids.empty":         "Noch keine Gebote.",
  "bids.won":           "Gewonnen",
  "bids.ended":         "Beendet",
  "bids.winning":       "Führend",
  "bids.outbid":        "Überboten",
  "bids.topAndCurr":    "Dein Top {top} · Aktuell {current}",
  "bids.signInTitle":   "Anmelden, um Gebote zu verfolgen",
  "bids.signInBody":    "Erstelle ein Konto oder melde dich an.",
  "bids.loading":       "Gebote werden geladen…",
  "bids.emptyTitle":    "Noch keine Gebote",
  "bids.emptyBody":     "Du hast noch keine Gebote abgegeben. Erkunde Live-Auktionen.",
  "bids.viewInvoice":   "Rechnung & Zahlung",

  "watchlist.title":    "Merkliste",
  "watchlist.empty":    "Keine Fahrzeuge auf der Merkliste.",
  "watchlist.signin":   "Anmelden, um die Merkliste zu nutzen.",
  "watchlist.added":    "Zur Merkliste hinzugefügt",
  "watchlist.removed":  "Aus der Merkliste entfernt",
  "watchlist.loading":      "Merkliste wird geladen…",
  "watchlist.savedCount":   "{count} gespeichert",
  "watchlist.errLoad":      "Konnte Merkliste nicht laden: {error}",
  "watchlist.signInTitle":  "Anmelden, um Fahrzeuge zu speichern",
  "watchlist.emptyTitle":   "Deine Merkliste ist leer",
  "watchlist.emptyBody":    "Noch keine Fahrzeuge gespeichert. Erkunde den Marktplatz.",
  "watchlist.cantUpdate":   "Merkliste konnte nicht aktualisiert werden",
  "watchlist.signInRequired":"Anmeldung erforderlich",

  "profile.title":      "Profil",
  "profile.section":    "Kontodetails",
  "profile.save":       "Änderungen speichern",
  "profile.saving":     "Speichern…",
  "profile.saved":      "Profil aktualisiert.",
  "profile.kycOK":      "KYC verifiziert",
  "profile.kycPending": "KYC ausstehend",
  "profile.kycRej":     "KYC abgelehnt",
  "profile.signin":     "Anmelden, um Profil zu sehen.",
  "profile.phone":      "Telefon",
  "profile.language":   "Sprache",
  "profile.memberSince":"Mitglied seit {date}",
  "profile.myBids":     "Meine Gebote",
  "profile.seeAll":     "Alle anzeigen",
  "profile.noBids":     "Noch keine Gebote. Erkunde Live-Auktionen.",
  "profile.wonAuctions":"Gewonnene Auktionen",
  "profile.wonAt":      "Gewonnen bei {price}",
  "profile.yourBid":    "Dein Gebot",
  "profile.current":    "Aktuell",
  "profile.viewAuction":"Auktion ansehen",

  "deleteAccount.button":        "Konto löschen",
  "deleteAccount.title":         "Konto löschen",
  "deleteAccount.warning":       "Dadurch werden dein Konto und alle zugehörigen Daten dauerhaft gelöscht.",
  "deleteAccount.loseIntro":     "Du verlierst:",
  "deleteAccount.loseBids":      "Deine Gebote und deine Merkliste",
  "deleteAccount.loseInvoices":  "Zugriff auf frühere Rechnungen",
  "deleteAccount.cannotUndo":    "Diese Aktion kann nicht rückgängig gemacht werden.",
  "deleteAccount.typeToConfirm": "Gib DELETE ein, um zu bestätigen.",
  "deleteAccount.confirm":       "Mein Konto löschen",
  "deleteAccount.deleting":      "Wird gelöscht…",
  "deleteAccount.cancel":        "Abbrechen",
  "deleteAccount.success":       "Dein Konto wurde gelöscht.",
  "deleteAccount.failed":        "Dein Konto konnte nicht gelöscht werden. Bitte versuche es erneut.",

  "won.title":          "Glückwunsch!",
  "won.subtitle":       "Du hast diese Auktion gewonnen.",
  "won.closed":         "Diese Auktion ist beendet.",
  "won.invoice":        "Rechnung",
  "won.hammer":         "Zuschlagspreis",
  "won.platformFee":    "Plattformgebühr (2,9 %)",
  "won.totalDue":       "Gesamtbetrag",
  "won.deadlineEyebrow":"Zahlung innerhalb von 5 Arbeitstagen",
  "won.paymentTitle":   "Zahlungsanweisungen",
  "won.paymentBody":    "Überweisung an Bradshaw Automation innerhalb von 5 Arbeitstagen. Versand oder Abholung beginnt nach Zahlungseingang.",
  "won.bankDetails":    "Bankdaten werden an deine hinterlegte E-Mail gesendet",
  "won.share":          "Rechnung teilen",
  "won.backMarket":     "Zum Marktplatz",
  "won.viewVehicle":    "Fahrzeug ansehen",

  "timeline.orderStatus": "Bestellstatus",
  "timeline.sold":        "Verkauft",
  "timeline.pickedUp":    "Abgeholt",
  "timeline.inTransit":   "Im Transit",
  "timeline.delivered":   "Geliefert",
};

const fr: Dict = {
  "nav.marketplace":  "Marché",
  "nav.auctions":     "Enchères en direct",
  "nav.live":         "En direct",
  "nav.myBids":       "Mes enchères",
  "nav.watchlist":    "Favoris",
  "nav.profile":      "Profil",
  "nav.vehicle":      "Véhicule",
  "nav.auction":      "Enchère",
  "nav.auctionWon":   "Gagnée",
  "nav.signOut":      "Déconnexion",

  "live.title":      "Enchères en direct",
  "live.subtitle":   "Enchérissez sur des véhicules qui se terminent bientôt.",
  "live.empty":      "Aucune enchère en direct.",
  "live.endingSoon": "Se terminant le plus tôt",

  "vehicle.scheduled":  "Débute {when}",
  "vehicle.scheduledShort": "Programmée",
  "vehicle.shipping":   "Livraison",
  "vehicle.shippingNote": "Estimations · depuis Jebel Ali, Dubaï",
  "vehicle.buyNowFull": "Acheter {price}",

  "auth.welcomeBack":   "Bon retour",
  "auth.signInBlurb":   "Connectez-vous pour enchérir sur des véhicules des EAU.",
  "auth.email":         "E-mail",
  "auth.password":      "Mot de passe",
  "auth.signIn":        "Se connecter",
  "auth.signingIn":     "Connexion…",
  "auth.createAccount": "Créer un compte pro",
  "auth.openTrade":     "Ouvrir un compte pro",
  "auth.twoMinutes":    "Deux minutes. Approuvé sous 24 h.",
  "auth.fullName":      "Nom complet",
  "auth.company":       "Société",
  "auth.country":       "Pays",
  "auth.creating":      "Création…",
  "auth.backToSignIn":  "Retour à la connexion",
  "auth.weakPwd":       "Au moins 8 caractères.",
  "auth.missing":       "Saisissez l'e-mail et le mot de passe.",

  "marketplace.title":  "Marché",
  "marketplace.search": "Marque, modèle, VIN…",
  "marketplace.results":"{count} sur {total} véhicules",
  "marketplace.empty":  "Aucun véhicule.",
  "marketplace.allTab": "Tous les véhicules",
  "marketplace.liveTab":"En direct",
  "marketplace.liveCount":"{count} en direct · se terminant le plus tôt",
  "marketplace.heroEyebrow":   "EAU → EUROPE",
  "marketplace.heroTitle":     "Véhicules premium du Golfe",
  "marketplace.heroSub":       "Inspectés. Mis aux enchères. Livrés en Europe.",
  "marketplace.heroVehicles":  "véhicules",
  "marketplace.heroLiveNow":   "en direct",
  "marketplace.noLiveTitle":   "Aucune enchère en direct",
  "marketplace.noLiveBody":    "Rien en direct. Passez à « Tous les véhicules ».",
  "marketplace.noMatches":     "Aucun résultat",

  "vehicle.specs":      "Caractéristiques",
  "vehicle.features":   "Équipement",
  "vehicle.condition":  "Rapport d'état",
  "vehicle.noDamage":   "Aucun dommage signalé.",
  "vehicle.sellerNotes":"Notes du vendeur",
  "vehicle.viewAuction":"Voir l'enchère",
  "vehicle.loading":       "Chargement du véhicule…",
  "vehicle.notFound":      "Véhicule introuvable.",
  "vehicle.startingPrice": "Prix de départ",
  "vehicle.finalPrice":    "Prix final",
  "vehicle.listedPrice":   "Prix affiché",
  "vehicle.viewInvoice":   "Voir la facture",
  "vehicle.viewResult":    "Voir le résultat",
  "vehicle.bidNow":        "Enchérir",
  "vehicle.buyNowPrice":   "Acheter {price}",
  "vehicle.shippingChoose":"Choisissez la livraison. Les prix reflètent la devise sélectionnée.",
  "vehicle.totalEstimate": "Estimation totale",
  "vehicle.totalBreakdown":"{price} véhicule + {shipping} {method}",
  "vehicle.specVin":          "VIN",
  "vehicle.specMileage":      "Kilométrage",
  "vehicle.specFuel":         "Carburant",
  "vehicle.specTransmission": "Transmission",
  "vehicle.specBody":         "Carrosserie",
  "vehicle.specExterior":     "Extérieur",
  "vehicle.specInterior":     "Intérieur",
  "vehicle.specListedPrice":  "Prix affiché",

  "auction.currentBid": "Enchère actuelle",
  "auction.yourBid":    "Votre enchère",
  "auction.minBid":     "Enchère min. : {price}",
  "auction.placeBid":   "Enchérir",
  "auction.placing":    "Envoi…",
  "auction.ended":      "Enchère terminée",
  "auction.bidsBidders":"{bids} enchères · {bidders} enchérisseurs",
  "auction.history":    "Historique",
  "auction.noBids":     "Aucune enchère.",
  "auction.winning":    "Vous êtes en tête !",
  "auction.outbid":     "Vous avez été surenchéri",
  "auction.outbidBody": "Nouvelle enchère {price}",
  "auction.buyNow":     "Acheter · {price}",
  "auction.buyNowQ":    "Acheter maintenant ?",
  "auction.buyNowConfirm":"Oui, acheter",
  "auction.buyWonTitle":"Vous avez gagné !",
  "auction.buyWonBody": "Notre équipe vous contactera.",
  "auction.loading":             "Chargement de l'enchère…",
  "auction.notFound":            "Enchère introuvable.",
  "auction.signInRequired":      "Connexion requise",
  "auction.signInToBid":         "Connectez-vous pour enchérir.",
  "auction.bidTooLow":           "Enchère trop basse",
  "auction.bidTooLowBody":       "L'enchère minimale est {price}.",
  "auction.proxyTooLow":         "Maximum trop bas",
  "auction.proxyTooLowBody":     "L'enchère max doit au moins égaler votre enchère.",
  "auction.bidFailed":           "Échec de l'enchère",
  "auction.tryAgain":            "Une erreur est survenue. Veuillez réessayer.",
  "auction.proxyPlacedTitle":    "Enchère proxy placée",
  "auction.proxyPlacedBody":     "Nous enchérissons par tranches de 500€ jusqu'à {max}.",
  "auction.purchaseFailed":      "Achat impossible",
  "auction.setMaxBid":           "Définir l'enchère max",
  "auction.proxyHint":           "Nous enchérissons par tranches de 500€ jusqu'à {max}. Votre limite reste privée.",
  "auction.youLabel":            "Vous",
  "auction.bidderLabel":         "Enchérisseur #{id}",
  "auction.topBid":              "Meilleure offre",
  "auction.proxyTag":            " · proxy",
  "auction.buyNowBody":          "Vous achetez {vehicle} pour {price}. L'enchère se ferme.",
  "auction.cancel":              "Annuler",

  "bids.title":         "Mes enchères",
  "bids.empty":         "Pas d'enchères.",
  "bids.won":           "Gagné",
  "bids.ended":         "Terminé",
  "bids.winning":       "En tête",
  "bids.outbid":        "Surenchéri",
  "bids.topAndCurr":    "Votre max {top} · Actuel {current}",
  "bids.signInTitle":   "Connectez-vous pour suivre vos enchères",
  "bids.signInBody":    "Créez un compte ou connectez-vous.",
  "bids.loading":       "Chargement de vos enchères…",
  "bids.emptyTitle":    "Pas d'enchères",
  "bids.emptyBody":     "Vous n'avez pas encore enchéri. Explorez les enchères.",
  "bids.viewInvoice":   "Facture & Paiement",

  "watchlist.title":    "Favoris",
  "watchlist.empty":    "Aucun favori.",
  "watchlist.signin":   "Connectez-vous pour les favoris.",
  "watchlist.added":    "Ajouté aux favoris",
  "watchlist.removed":  "Retiré des favoris",
  "watchlist.loading":      "Chargement des favoris…",
  "watchlist.savedCount":   "{count} enregistré(s)",
  "watchlist.errLoad":      "Impossible de charger : {error}",
  "watchlist.signInTitle":  "Connectez-vous pour enregistrer des véhicules",
  "watchlist.emptyTitle":   "Vos favoris sont vides",
  "watchlist.emptyBody":    "Aucun véhicule enregistré. Explorez le marché.",
  "watchlist.cantUpdate":   "Impossible de mettre à jour les favoris",
  "watchlist.signInRequired":"Connexion requise",

  "profile.title":      "Profil",
  "profile.section":    "Détails du compte",
  "profile.save":       "Enregistrer",
  "profile.saving":     "Enregistrement…",
  "profile.saved":      "Profil enregistré.",
  "profile.kycOK":      "KYC vérifié",
  "profile.kycPending": "KYC en attente",
  "profile.kycRej":     "KYC rejeté",
  "profile.signin":     "Connectez-vous pour voir le profil.",
  "profile.phone":      "Téléphone",
  "profile.language":   "Langue",
  "profile.memberSince":"Membre depuis {date}",
  "profile.myBids":     "Mes enchères",
  "profile.seeAll":     "Tout voir",
  "profile.noBids":     "Aucune enchère. Parcourez les enchères en direct.",
  "profile.wonAuctions":"Enchères gagnées",
  "profile.wonAt":      "Gagné à {price}",
  "profile.yourBid":    "Votre enchère",
  "profile.current":    "Actuel",
  "profile.viewAuction":"Voir l'enchère",

  "deleteAccount.button":        "Supprimer le compte",
  "deleteAccount.title":         "Supprimer le compte",
  "deleteAccount.warning":       "Cela supprimera définitivement votre compte et toutes les données associées.",
  "deleteAccount.loseIntro":     "Vous perdrez :",
  "deleteAccount.loseBids":      "Vos enchères et vos favoris",
  "deleteAccount.loseInvoices":  "L'accès aux factures passées",
  "deleteAccount.cannotUndo":    "Cette action est irréversible.",
  "deleteAccount.typeToConfirm": "Tapez DELETE pour confirmer.",
  "deleteAccount.confirm":       "Supprimer mon compte",
  "deleteAccount.deleting":      "Suppression…",
  "deleteAccount.cancel":        "Annuler",
  "deleteAccount.success":       "Votre compte a été supprimé.",
  "deleteAccount.failed":        "Impossible de supprimer votre compte. Veuillez réessayer.",

  "won.title":          "Félicitations !",
  "won.subtitle":       "Vous avez gagné cette enchère.",
  "won.closed":         "Cette enchère est terminée.",
  "won.invoice":        "Facture",
  "won.hammer":         "Prix d'adjudication",
  "won.platformFee":    "Frais de plateforme (2,9 %)",
  "won.totalDue":       "Total dû",
  "won.deadlineEyebrow":"Paiement sous 5 jours ouvrés",
  "won.paymentTitle":   "Instructions de paiement",
  "won.paymentBody":    "Virement à Bradshaw Automation sous 5 jours ouvrés. La livraison ou le retrait commence après confirmation du paiement.",
  "won.bankDetails":    "Les coordonnées bancaires seront envoyées à votre e-mail",
  "won.share":          "Partager la facture",
  "won.backMarket":     "Retour au marché",
  "won.viewVehicle":    "Voir le véhicule",

  "timeline.orderStatus": "Statut de la commande",
  "timeline.sold":        "Vendu",
  "timeline.pickedUp":    "Récupéré",
  "timeline.inTransit":   "En transit",
  "timeline.delivered":   "Livré",
};

const ar: Dict = {
  "nav.marketplace":  "السوق",
  "nav.auctions":     "المزادات المباشرة",
  "nav.live":         "مباشر",
  "nav.myBids":       "عروضي",
  "nav.watchlist":    "المفضلة",
  "nav.profile":      "الملف الشخصي",
  "nav.vehicle":      "المركبة",
  "nav.auction":      "المزاد",
  "nav.auctionWon":   "ربحت",
  "nav.signOut":      "تسجيل الخروج",

  "live.title":      "المزادات المباشرة",
  "live.subtitle":   "زايد الآن على مركبات تنتهي قريبًا.",
  "live.empty":      "لا توجد مزادات مباشرة حاليًا.",
  "live.endingSoon": "الأقرب للانتهاء أولًا",

  "vehicle.scheduled":  "يبدأ {when}",
  "vehicle.scheduledShort": "مجدول",
  "vehicle.shipping":   "الشحن والتوصيل",
  "vehicle.shippingNote": "تقديرات · من جبل علي، دبي",
  "vehicle.buyNowFull": "اشترِ الآن {price}",

  "auth.welcomeBack":   "مرحبًا بعودتك",
  "auth.signInBlurb":   "سجّل الدخول للمزايدة على مركبات من الإمارات.",
  "auth.email":         "البريد الإلكتروني",
  "auth.password":      "كلمة المرور",
  "auth.signIn":        "تسجيل الدخول",
  "auth.signingIn":     "جارٍ تسجيل الدخول…",
  "auth.createAccount": "إنشاء حساب تجاري",
  "auth.openTrade":     "فتح حساب تجاري",
  "auth.twoMinutes":    "دقيقتان. الموافقة خلال يوم.",
  "auth.fullName":      "الاسم الكامل",
  "auth.company":       "الشركة",
  "auth.country":       "الدولة",
  "auth.creating":      "جارٍ الإنشاء…",
  "auth.backToSignIn":  "العودة لتسجيل الدخول",
  "auth.weakPwd":       "8 أحرف على الأقل.",
  "auth.missing":       "أدخل البريد الإلكتروني وكلمة المرور.",

  "marketplace.title":  "السوق",
  "marketplace.search": "ابحث بالماركة أو الموديل…",
  "marketplace.results":"{count} من {total} مركبة",
  "marketplace.empty":  "لا توجد مركبات.",
  "marketplace.allTab": "كل المركبات",
  "marketplace.liveTab":"مباشر الآن",
  "marketplace.liveCount":"{count} مباشر · الأقرب للانتهاء",
  "marketplace.heroEyebrow":   "الإمارات → أوروبا",
  "marketplace.heroTitle":     "مركبات خليجية فاخرة",
  "marketplace.heroSub":       "تمّ فحصها. تمّ بيعها بالمزاد. تُسلَّم إلى أوروبا.",
  "marketplace.heroVehicles":  "مركبة",
  "marketplace.heroLiveNow":   "مباشر الآن",
  "marketplace.noLiveTitle":   "لا توجد مزادات مباشرة",
  "marketplace.noLiveBody":    "لا شيء مباشر الآن. انتقل إلى „كل المركبات“.",
  "marketplace.noMatches":     "لا نتائج",

  "vehicle.specs":      "المواصفات",
  "vehicle.features":   "المعدات",
  "vehicle.condition":  "تقرير الحالة",
  "vehicle.noDamage":   "لا توجد أضرار.",
  "vehicle.sellerNotes":"ملاحظات البائع",
  "vehicle.viewAuction":"اذهب إلى المزاد",
  "vehicle.loading":       "جارٍ تحميل المركبة…",
  "vehicle.notFound":      "المركبة غير موجودة.",
  "vehicle.startingPrice": "سعر البدء",
  "vehicle.finalPrice":    "السعر النهائي",
  "vehicle.listedPrice":   "السعر المعلن",
  "vehicle.viewInvoice":   "عرض الفاتورة",
  "vehicle.viewResult":    "عرض النتيجة",
  "vehicle.bidNow":        "زايد الآن",
  "vehicle.buyNowPrice":   "اشترِ الآن {price}",
  "vehicle.shippingChoose":"اختر طريقة التوصيل. الأسعار بالعملة المختارة.",
  "vehicle.totalEstimate": "التقدير الإجمالي",
  "vehicle.totalBreakdown":"{price} مركبة + {shipping} {method}",
  "vehicle.specVin":          "VIN",
  "vehicle.specMileage":      "المسافة",
  "vehicle.specFuel":         "الوقود",
  "vehicle.specTransmission": "ناقل الحركة",
  "vehicle.specBody":         "الهيكل",
  "vehicle.specExterior":     "اللون الخارجي",
  "vehicle.specInterior":     "اللون الداخلي",
  "vehicle.specListedPrice":  "السعر المعلن",

  "auction.currentBid": "العرض الحالي",
  "auction.yourBid":    "عرضك",
  "auction.minBid":     "الحد الأدنى للعرض التالي: {price}",
  "auction.placeBid":   "قدّم العرض",
  "auction.placing":    "جارٍ الإرسال…",
  "auction.ended":      "انتهى المزاد",
  "auction.bidsBidders":"{bids} عرض · {bidders} مزايد",
  "auction.history":    "سجل العروض",
  "auction.noBids":     "لا توجد عروض بعد.",
  "auction.winning":    "أنت في الصدارة!",
  "auction.outbid":     "تم تجاوز عرضك",
  "auction.outbidBody": "عرض أعلى جديد {price}",
  "auction.buyNow":     "اشترِ الآن · {price}",
  "auction.buyNowQ":    "هل تشتري الآن؟",
  "auction.buyNowConfirm":"نعم، اشترِ",
  "auction.buyWonTitle":"لقد فزت!",
  "auction.buyWonBody": "سيتواصل معك فريقنا.",
  "auction.loading":             "جارٍ تحميل المزاد…",
  "auction.notFound":            "المزاد غير موجود.",
  "auction.signInRequired":      "تسجيل الدخول مطلوب",
  "auction.signInToBid":         "سجّل الدخول للمزايدة.",
  "auction.bidTooLow":           "العرض منخفض",
  "auction.bidTooLowBody":       "الحد الأدنى للعرض التالي هو {price}.",
  "auction.proxyTooLow":         "الحد الأقصى منخفض",
  "auction.proxyTooLowBody":     "يجب أن يساوي الحد الأقصى عرضك الحالي على الأقل.",
  "auction.bidFailed":           "فشل العرض",
  "auction.tryAgain":            "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
  "auction.proxyPlacedTitle":    "تم وضع عرض وكيل",
  "auction.proxyPlacedBody":     "سنزايد نيابة عنك بفوارق 500€ حتى {max}.",
  "auction.purchaseFailed":      "تعذّر إتمام الشراء",
  "auction.setMaxBid":           "حدد الحد الأقصى",
  "auction.proxyHint":           "سنزايد نيابة عنك حتى {max}. لن يرى المزايدون الآخرون حدّك.",
  "auction.youLabel":            "أنت",
  "auction.bidderLabel":         "مزايد #{id}",
  "auction.topBid":              "أعلى عرض",
  "auction.proxyTag":            " · وكيل",
  "auction.buyNowBody":          "ستشتري {vehicle} بسعر {price}. سيُغلق المزاد فورًا.",
  "auction.cancel":              "إلغاء",

  "bids.title":         "عروضي",
  "bids.empty":         "لا توجد عروض.",
  "bids.won":           "فائز",
  "bids.ended":         "منتهٍ",
  "bids.winning":       "في الصدارة",
  "bids.outbid":        "متجاوَز",
  "bids.topAndCurr":    "عرضك الأعلى {top} · الحالي {current}",
  "bids.signInTitle":   "سجّل الدخول لمتابعة عروضك",
  "bids.signInBody":    "أنشئ حسابًا أو سجّل الدخول.",
  "bids.loading":       "جارٍ تحميل عروضك…",
  "bids.emptyTitle":    "لا توجد عروض",
  "bids.emptyBody":     "لم تقدّم أي عروض بعد. تصفّح المزادات.",
  "bids.viewInvoice":   "الفاتورة والسداد",

  "watchlist.title":    "المفضلة",
  "watchlist.empty":    "لا توجد مفضلة.",
  "watchlist.signin":   "سجّل الدخول لاستخدام المفضلة.",
  "watchlist.added":    "أُضيف إلى المفضلة",
  "watchlist.removed":  "أُزيل من المفضلة",
  "watchlist.loading":      "جارٍ تحميل المفضلة…",
  "watchlist.savedCount":   "{count} محفوظ",
  "watchlist.errLoad":      "تعذّر تحميل المفضلة: {error}",
  "watchlist.signInTitle":  "سجّل الدخول لحفظ المركبات",
  "watchlist.emptyTitle":   "المفضلة فارغة",
  "watchlist.emptyBody":    "لا توجد مركبات محفوظة. تصفّح السوق.",
  "watchlist.cantUpdate":   "تعذّر تحديث المفضلة",
  "watchlist.signInRequired":"تسجيل الدخول مطلوب",

  "profile.title":      "الملف الشخصي",
  "profile.section":    "تفاصيل الحساب",
  "profile.save":       "حفظ التغييرات",
  "profile.saving":     "جارٍ الحفظ…",
  "profile.saved":      "تم تحديث الملف.",
  "profile.kycOK":      "تم التحقق من الهوية",
  "profile.kycPending": "بانتظار التحقق",
  "profile.kycRej":     "رُفضت الهوية",
  "profile.signin":     "سجّل الدخول لعرض الملف.",
  "profile.phone":      "الهاتف",
  "profile.language":   "اللغة",
  "profile.memberSince":"عضو منذ {date}",
  "profile.myBids":     "عروضي",
  "profile.seeAll":     "عرض الكل",
  "profile.noBids":     "لا توجد عروض. تصفّح المزادات المباشرة.",
  "profile.wonAuctions":"المزادات المربوحة",
  "profile.wonAt":      "فُزت عند {price}",
  "profile.yourBid":    "عرضك",
  "profile.current":    "الحالي",
  "profile.viewAuction":"عرض المزاد",

  "deleteAccount.button":        "حذف الحساب",
  "deleteAccount.title":         "حذف الحساب",
  "deleteAccount.warning":       "سيؤدي هذا إلى حذف حسابك وجميع البيانات المرتبطة به نهائيًا.",
  "deleteAccount.loseIntro":     "ستفقد:",
  "deleteAccount.loseBids":      "عروضك وقائمة المفضلة",
  "deleteAccount.loseInvoices":  "الوصول إلى الفواتير السابقة",
  "deleteAccount.cannotUndo":    "لا يمكن التراجع عن هذا الإجراء.",
  "deleteAccount.typeToConfirm": "اكتب DELETE للتأكيد.",
  "deleteAccount.confirm":       "حذف حسابي",
  "deleteAccount.deleting":      "جارٍ الحذف…",
  "deleteAccount.cancel":        "إلغاء",
  "deleteAccount.success":       "تم حذف حسابك.",
  "deleteAccount.failed":        "تعذّر حذف حسابك. يرجى المحاولة مرة أخرى.",

  "won.title":          "مبروك!",
  "won.subtitle":       "لقد فزت بهذا المزاد.",
  "won.closed":         "انتهى هذا المزاد.",
  "won.invoice":        "الفاتورة",
  "won.hammer":         "سعر المطرقة",
  "won.platformFee":    "رسوم المنصة (2.9%)",
  "won.totalDue":       "المبلغ المستحق",
  "won.deadlineEyebrow":"السداد خلال 5 أيام عمل",
  "won.paymentTitle":   "تعليمات السداد",
  "won.paymentBody":    "تحويل بنكي إلى Bradshaw Automation خلال 5 أيام عمل. يبدأ الشحن أو الاستلام عند تأكيد السداد.",
  "won.bankDetails":    "ستُرسل تفاصيل البنك إلى بريدك المسجّل",
  "won.share":          "شارك ملخص الفاتورة",
  "won.backMarket":     "العودة إلى السوق",
  "won.viewVehicle":    "عرض المركبة",

  "timeline.orderStatus": "حالة الطلب",
  "timeline.sold":        "تم البيع",
  "timeline.pickedUp":    "تم الاستلام",
  "timeline.inTransit":   "قيد الشحن",
  "timeline.delivered":   "تم التسليم",
};

const DICTS: Record<Locale, Dict> = { en, de, ar, fr };

function format(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ""));
}

// RTL via RN's I18nManager — the supported cross-platform path.  The
// per-View `direction` style only works on iOS and crashes Android.
// I18nManager flips the global writing direction; the change takes effect
// after the JS bundle reloads (Android requires a native restart, which
// happens on next app launch in production).
function applyRtl(shouldBeRtl: boolean) {
  try {
    I18nManager.allowRTL(shouldBeRtl);
    if (I18nManager.isRTL !== shouldBeRtl) {
      I18nManager.forceRTL(shouldBeRtl);
    }
  } catch { /* RN platform without I18nManager (web) — no-op */ }
}

// Persist the chosen locale to the user's profile so the web app and other
// clients pick it up. Capped so a slow/offline network can never hang the
// switch — important because the RTL path awaits this before reloading.
async function persistLocaleToProfile(next: Locale): Promise<void> {
  const work = (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from("profiles").update({ language: next }).eq("id", user.id);
    } catch { /* silent */ }
  })();
  const cap = new Promise<void>((resolve) => setTimeout(resolve, 2500));
  await Promise.race([work, cap]);
}

// ------- Context wiring ----------------------------------------------

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => Promise<void>;
  isRtl: boolean;
  // True while a direction-flipping locale switch is persisting + reloading the
  // bundle, so the language picker can show a loading state.
  switchingLocale: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [switching, setSwitching] = useState(false);

  // On mount: prefer the signed-in user's profile.language, fall back to
  // SecureStore (across sign-outs), then default.
  useEffect(() => {
    (async () => {
      let next: Locale | null = null;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from("profiles").select("language").eq("id", user.id).single();
          if (data?.language && SUPPORTED.includes(data.language as Locale)) {
            next = data.language as Locale;
          }
        }
      } catch { /* offline / signed out */ }
      if (!next) {
        const stored = await SecureStore.getItemAsync(STORE_KEY).catch(() => null);
        if (stored && SUPPORTED.includes(stored as Locale)) next = stored as Locale;
      }
      if (next) {
        setLocaleState(next);
        applyRtl(next === "ar");
      }
    })();
  }, []);

  // Setter — update React state SYNCHRONOUSLY so every consuming screen
  // re-renders this frame.  Persistence to SecureStore + profile happens
  // in the background; failures are silent because they shouldn't block
  // the UI update the user just made.
  // Same-direction switches (EN ↔ DE ↔ FR) re-render instantly and persist in
  // the background — no reload. Switching INTO or OUT OF Arabic flips the
  // writing direction, which RN only applies on a JS reload, so we persist
  // FIRST (awaited, so the relaunched bundle returns in the new locale) and
  // then reload via expo-updates. Without the reload the screen stays mirrored
  // when going RTL → LTR.
  const setLocale = useCallback(async (next: Locale) => {
    const shouldBeRtl = next === "ar";
    const directionChanged = I18nManager.isRTL !== shouldBeRtl;

    setLocaleState(next);
    applyRtl(shouldBeRtl);

    if (!directionChanged) {
      void SecureStore.setItemAsync(STORE_KEY, next).catch(() => {});
      void persistLocaleToProfile(next);
      return;
    }

    setSwitching(true);
    await SecureStore.setItemAsync(STORE_KEY, next).catch(() => {});
    await persistLocaleToProfile(next);
    try {
      await Updates.reloadAsync();
      // reloadAsync tears down the JS context — nothing after this runs on success.
    } catch {
      // Dev client / Expo Go / web export: reloadAsync unavailable. forceRTL is
      // already set and applies on the next manual restart; free the picker.
      setSwitching(false);
    }
  }, []);

  const t = useCallback(
    (key: string, values?: Record<string, string | number>): string => {
      const dict = DICTS[locale] ?? en;
      return format(dict[key] ?? en[key] ?? key, values);
    },
    [locale],
  );

  return createElement(
    I18nContext.Provider,
    { value: { locale, setLocale, isRtl: locale === "ar", switchingLocale: switching, t } },
    children,
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used inside <I18nProvider>");
  return ctx;
}
