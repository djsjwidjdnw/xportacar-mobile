// Lightweight i18n for the mobile app.
// - Strings live in this file (subset of the web translations).
// - The active locale is fed from the signed-in user's profile.language
//   via I18nProvider in App.tsx, with a SecureStore fallback for guests.

import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { I18nManager } from "react-native";
import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";

export type Locale = "en" | "de" | "ar" | "fr";
export const SUPPORTED: Locale[] = ["en", "de", "ar", "fr"];
const STORE_KEY = "xpc_locale";

type Dict = Record<string, string>;

const en: Dict = {
  "nav.marketplace": "Marketplace",
  "nav.auctions":    "Live Auctions",
  "nav.myBids":      "My Bids",
  "nav.watchlist":   "Watchlist",
  "nav.profile":     "Profile",
  "nav.signOut":     "Sign out",

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

  "vehicle.specs":         "Specifications",
  "vehicle.features":      "Features & equipment",
  "vehicle.condition":     "Condition report",
  "vehicle.noDamage":      "No reported damage. Inspected and certified.",
  "vehicle.sellerNotes":   "Seller notes",
  "vehicle.viewAuction":   "View auction",

  "auction.currentBid":    "Current bid",
  "auction.yourBid":       "Your bid",
  "auction.minBid":        "Min next bid: {price}",
  "auction.placeBid":      "Place bid",
  "auction.placing":       "Placing…",
  "auction.ended":         "Auction ended",
  "auction.bidsBidders":   "{bids} bids · {bidders} bidders",
  "auction.history":       "Bid history",
  "auction.noBids":        "No bids yet.",
  "auction.winning":       "You are winning",
  "auction.outbid":        "You were outbid",
  "auction.outbidBody":    "New top bid {price}",
  "auction.buyNow":        "Buy now · {price}",
  "auction.buyNowQ":       "Buy now?",
  "auction.buyNowConfirm": "Yes, buy",
  "auction.buyWonTitle":   "You won!",
  "auction.buyWonBody":    "Our team will follow up.",

  "bids.title":      "My bids",
  "bids.empty":      "No bids yet — browse the marketplace.",
  "bids.won":        "Won",
  "bids.ended":      "Ended",
  "bids.winning":    "Winning",
  "bids.outbid":     "Outbid",
  "bids.topAndCurr": "Your top {top} · Current {current}",

  "watchlist.title": "Watchlist",
  "watchlist.empty": "No vehicles on your watchlist yet.",
  "watchlist.signin": "Sign in to use your watchlist.",
  "watchlist.added":   "Added to watchlist",
  "watchlist.removed": "Removed from watchlist",

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
};

const de: Dict = {
  "nav.marketplace": "Marktplatz",
  "nav.auctions":    "Live-Auktionen",
  "nav.myBids":      "Meine Gebote",
  "nav.watchlist":   "Merkliste",
  "nav.profile":     "Profil",
  "nav.signOut":     "Abmelden",
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
  "vehicle.specs":      "Technische Daten",
  "vehicle.features":   "Ausstattung",
  "vehicle.condition":  "Zustandsbericht",
  "vehicle.noDamage":   "Keine gemeldeten Schäden.",
  "vehicle.sellerNotes":"Verkäufernotizen",
  "vehicle.viewAuction":"Zur Auktion",
  "auction.currentBid": "Aktuelles Gebot",
  "auction.yourBid":    "Dein Gebot",
  "auction.minBid":     "Min. nächstes Gebot: {price}",
  "auction.placeBid":   "Gebot abgeben",
  "auction.placing":    "Wird gesendet…",
  "auction.ended":      "Auktion beendet",
  "auction.bidsBidders":"{bids} Gebote · {bidders} Bieter",
  "auction.history":    "Gebotsverlauf",
  "auction.noBids":     "Noch keine Gebote.",
  "auction.winning":    "Du führst",
  "auction.outbid":     "Du wurdest überboten",
  "auction.outbidBody": "Neues Höchstgebot {price}",
  "auction.buyNow":     "Sofort kaufen · {price}",
  "auction.buyNowQ":    "Sofort kaufen?",
  "auction.buyNowConfirm":"Ja, kaufen",
  "auction.buyWonTitle":"Du hast gewonnen!",
  "auction.buyWonBody": "Unser Team meldet sich.",
  "bids.title":         "Meine Gebote",
  "bids.empty":         "Noch keine Gebote.",
  "bids.won":           "Gewonnen",
  "bids.ended":         "Beendet",
  "bids.winning":       "Führend",
  "bids.outbid":        "Überboten",
  "bids.topAndCurr":    "Dein Top {top} · Aktuell {current}",
  "watchlist.title":    "Merkliste",
  "watchlist.empty":    "Keine Fahrzeuge auf der Merkliste.",
  "watchlist.signin":   "Anmelden, um die Merkliste zu nutzen.",
  "watchlist.added":    "Zur Merkliste hinzugefügt",
  "watchlist.removed":  "Aus der Merkliste entfernt",
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
};

const fr: Dict = {
  "nav.marketplace":  "Marché",
  "nav.auctions":     "Enchères en direct",
  "nav.myBids":       "Mes enchères",
  "nav.watchlist":    "Favoris",
  "nav.profile":      "Profil",
  "nav.signOut":      "Déconnexion",
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
  "vehicle.specs":      "Caractéristiques",
  "vehicle.features":   "Équipement",
  "vehicle.condition":  "Rapport d'état",
  "vehicle.noDamage":   "Aucun dommage signalé.",
  "vehicle.sellerNotes":"Notes du vendeur",
  "vehicle.viewAuction":"Voir l'enchère",
  "auction.currentBid": "Enchère actuelle",
  "auction.yourBid":    "Votre enchère",
  "auction.minBid":     "Enchère min. : {price}",
  "auction.placeBid":   "Enchérir",
  "auction.placing":    "Envoi…",
  "auction.ended":      "Enchère terminée",
  "auction.bidsBidders":"{bids} enchères · {bidders} enchérisseurs",
  "auction.history":    "Historique",
  "auction.noBids":     "Aucune enchère.",
  "auction.winning":    "Vous êtes en tête",
  "auction.outbid":     "Vous avez été surenchéri",
  "auction.outbidBody": "Nouvelle enchère {price}",
  "auction.buyNow":     "Acheter · {price}",
  "auction.buyNowQ":    "Acheter maintenant ?",
  "auction.buyNowConfirm":"Oui, acheter",
  "auction.buyWonTitle":"Vous avez gagné !",
  "auction.buyWonBody": "Notre équipe vous contactera.",
  "bids.title":         "Mes enchères",
  "bids.empty":         "Pas d'enchères.",
  "bids.won":           "Gagné",
  "bids.ended":         "Terminé",
  "bids.winning":       "En tête",
  "bids.outbid":        "Surenchéri",
  "bids.topAndCurr":    "Votre max {top} · Actuel {current}",
  "watchlist.title":    "Favoris",
  "watchlist.empty":    "Aucun favori.",
  "watchlist.signin":   "Connectez-vous pour les favoris.",
  "watchlist.added":    "Ajouté aux favoris",
  "watchlist.removed":  "Retiré des favoris",
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
};

const ar: Dict = {
  "nav.marketplace":  "السوق",
  "nav.auctions":     "المزادات المباشرة",
  "nav.myBids":       "عروضي",
  "nav.watchlist":    "المفضلة",
  "nav.profile":      "الملف الشخصي",
  "nav.signOut":      "تسجيل الخروج",
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
  "vehicle.specs":      "المواصفات",
  "vehicle.features":   "المعدات",
  "vehicle.condition":  "تقرير الحالة",
  "vehicle.noDamage":   "لا توجد أضرار.",
  "vehicle.sellerNotes":"ملاحظات البائع",
  "vehicle.viewAuction":"اذهب إلى المزاد",
  "auction.currentBid": "العرض الحالي",
  "auction.yourBid":    "عرضك",
  "auction.minBid":     "الحد الأدنى للعرض التالي: {price}",
  "auction.placeBid":   "قدّم العرض",
  "auction.placing":    "جارٍ الإرسال…",
  "auction.ended":      "انتهى المزاد",
  "auction.bidsBidders":"{bids} عرض · {bidders} مزايد",
  "auction.history":    "سجل العروض",
  "auction.noBids":     "لا توجد عروض بعد.",
  "auction.winning":    "أنت في الصدارة",
  "auction.outbid":     "تم تجاوز عرضك",
  "auction.outbidBody": "عرض أعلى جديد {price}",
  "auction.buyNow":     "اشترِ الآن · {price}",
  "auction.buyNowQ":    "هل تشتري الآن؟",
  "auction.buyNowConfirm":"نعم، اشترِ",
  "auction.buyWonTitle":"لقد فزت!",
  "auction.buyWonBody": "سيتواصل معك فريقنا.",
  "bids.title":         "عروضي",
  "bids.empty":         "لا توجد عروض.",
  "bids.won":           "فائز",
  "bids.ended":         "منتهٍ",
  "bids.winning":       "في الصدارة",
  "bids.outbid":        "متجاوَز",
  "bids.topAndCurr":    "عرضك الأعلى {top} · الحالي {current}",
  "watchlist.title":    "المفضلة",
  "watchlist.empty":    "لا توجد مفضلة.",
  "watchlist.signin":   "سجّل الدخول لاستخدام المفضلة.",
  "watchlist.added":    "أُضيف إلى المفضلة",
  "watchlist.removed":  "أُزيل من المفضلة",
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

// ------- Context wiring ----------------------------------------------

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => Promise<void>;
  isRtl: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

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

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    applyRtl(next === "ar");
    await SecureStore.setItemAsync(STORE_KEY, next).catch(() => {});
    // Best-effort: persist to profile so the web app picks it up too.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({ language: next }).eq("id", user.id);
      }
    } catch { /* silent */ }
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
    { value: { locale, setLocale, isRtl: locale === "ar", t } },
    children,
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used inside <I18nProvider>");
  return ctx;
}
