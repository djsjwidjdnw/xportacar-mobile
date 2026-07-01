import { View, Text, Pressable } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { LoginScreen as LoginScreenImpl } from "./screens/LoginScreen";
import { RegisterScreen as RegisterScreenImpl } from "./screens/RegisterScreen";
import { MarketplaceScreen as MarketplaceScreenImpl } from "./screens/MarketplaceScreen";
import { VehicleDetailScreen as VehicleDetailScreenImpl } from "./screens/VehicleDetailScreen";
import { AuctionScreen as AuctionScreenImpl } from "./screens/AuctionScreen";
import { WatchlistScreen as WatchlistScreenImpl } from "./screens/WatchlistScreen";
import { ProfileScreen as ProfileScreenImpl } from "./screens/ProfileScreen";
import { MyBidsScreen as MyBidsScreenImpl } from "./screens/MyBidsScreen";
import { AuctionWonScreen as AuctionWonScreenImpl } from "./screens/AuctionWonScreen";

// React-Navigation's Screen prop types differ from a hand-written screen
// signature.  Cast through `unknown` here once so each screen stays
// strongly typed inside its own file.
type AnyScreen = React.ComponentType<Record<string, unknown>>;
const LoginScreen          = LoginScreenImpl          as unknown as AnyScreen;
const RegisterScreen       = RegisterScreenImpl       as unknown as AnyScreen;
const MarketplaceScreen    = MarketplaceScreenImpl    as unknown as AnyScreen;
const VehicleDetailScreen  = VehicleDetailScreenImpl  as unknown as AnyScreen;
const AuctionScreen        = AuctionScreenImpl        as unknown as AnyScreen;
const WatchlistScreen      = WatchlistScreenImpl      as unknown as AnyScreen;
const ProfileScreen        = ProfileScreenImpl        as unknown as AnyScreen;
const MyBidsScreen         = MyBidsScreenImpl         as unknown as AnyScreen;
const AuctionWonScreen     = AuctionWonScreenImpl     as unknown as AnyScreen;

import { useAuth } from "./lib/auth";
import { useTranslation } from "./lib/i18n";
import { theme } from "./lib/theme";

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

// Roles allowed to use the BUYER app. Inspectors have their own app; admins /
// superadmins may use either surface. A confirmed 'inspector' is blocked here.
const BUYER_ROLES = ["buyer", "admin", "superadmin"];

// Shown when a signed-in inspector lands in the buyer app. Gives a clear
// message and a sign-out so they can switch to the Inspector app.
function NotAuthorizedScreen() {
  const { signOut } = useAuth();
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: theme.colors.bg }}>
      <Text style={{ fontSize: 18, fontWeight: "800", color: theme.colors.text, marginBottom: 8, textAlign: "center" }}>
        {t("gate.inspectorTitle")}
      </Text>
      <Text style={{ fontSize: 14, color: theme.colors.textLight, textAlign: "center", marginBottom: 20, lineHeight: 20 }}>
        {t("gate.inspectorBody")}
      </Text>
      <Pressable
        onPress={() => { void signOut(); }}
        style={{ backgroundColor: theme.colors.brand, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 }}
      >
        <Text style={{ color: theme.colors.white, fontWeight: "600", fontSize: 14 }}>{t("nav.signOut")}</Text>
      </Pressable>
    </View>
  );
}

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.bg,
    card:       theme.colors.white,
    primary:    theme.colors.brand,
    text:       theme.colors.text,
    border:     theme.colors.border,
  },
};

function makeTabIcon(name: keyof typeof Ionicons.glyphMap) {
  return function TabIcon({ focused, color }: { focused: boolean; color: string }) {
    return (
      <Ionicons
        name={name}
        size={focused ? 24 : 22}
        color={color}
      />
    );
  };
}

// Header titles are localised at render time via useTranslation in each
// stack so that switching language re-renders the title strings instantly.

function useStackTitles() {
  const { t } = useTranslation();
  return {
    vehicle: t("nav.vehicle"),
    auction: t("nav.auction"),
    auctionWon: t("nav.auctionWon"),
    myBids: t("nav.myBids"),
  };
}

function MarketplaceStack() {
  const titles = useStackTitles();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MarketplaceHome"  component={MarketplaceScreen} />
      <Stack.Screen name="VehicleDetail"    component={VehicleDetailScreen} options={{ headerShown: true, title: titles.vehicle }} />
      <Stack.Screen name="Auction"          component={AuctionScreen}       options={{ headerShown: true, title: titles.auction }} />
      <Stack.Screen name="AuctionWon"       component={AuctionWonScreen}    options={{ headerShown: true, title: titles.auctionWon }} />
    </Stack.Navigator>
  );
}

function MyBidsStack() {
  const titles = useStackTitles();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyBidsHome"    component={MyBidsScreen} />
      <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} options={{ headerShown: true, title: titles.vehicle }} />
      <Stack.Screen name="Auction"       component={AuctionScreen}       options={{ headerShown: true, title: titles.auction }} />
      <Stack.Screen name="AuctionWon"    component={AuctionWonScreen}    options={{ headerShown: true, title: titles.auctionWon }} />
    </Stack.Navigator>
  );
}

function WatchlistStack() {
  const titles = useStackTitles();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WatchlistHome" component={WatchlistScreen} />
      <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} options={{ headerShown: true, title: titles.vehicle }} />
      <Stack.Screen name="Auction"       component={AuctionScreen}       options={{ headerShown: true, title: titles.auction }} />
      <Stack.Screen name="AuctionWon"    component={AuctionWonScreen}    options={{ headerShown: true, title: titles.auctionWon }} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  const titles = useStackTitles();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileHome"   component={ProfileScreen} />
      <Stack.Screen name="MyBidsList"    component={MyBidsScreen}        options={{ headerShown: true, title: titles.myBids }} />
      <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} options={{ headerShown: true, title: titles.vehicle }} />
      <Stack.Screen name="Auction"       component={AuctionScreen}       options={{ headerShown: true, title: titles.auction }} />
      <Stack.Screen name="AuctionWon"    component={AuctionWonScreen}    options={{ headerShown: true, title: titles.auctionWon }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const { t } = useTranslation();
  // Lift the tab bar above the Android system nav / iOS home indicator.
  // Without this the Watchlist + Profile tabs sit behind the OS buttons.
  const insets = useSafeAreaInsets();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.brand,
        tabBarInactiveTintColor: theme.colors.textLight,
        tabBarStyle: {
          backgroundColor: theme.colors.white,
          borderTopColor: theme.colors.border,
          height: 64 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 10,
        },
        tabBarLabelStyle: { fontWeight: "700", fontSize: 11, marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="Marketplace"
        component={MarketplaceStack}
        options={{ tabBarLabel: t("nav.marketplace"), tabBarIcon: makeTabIcon("cart-outline") }}
      />
      <Tabs.Screen
        name="MyBids"
        component={MyBidsStack}
        options={{ tabBarLabel: t("nav.myBids"), tabBarIcon: makeTabIcon("hammer-outline") }}
      />
      <Tabs.Screen
        name="Watchlist"
        component={WatchlistStack}
        options={{ tabBarLabel: t("nav.watchlist"), tabBarIcon: makeTabIcon("heart-outline") }}
      />
      <Tabs.Screen
        name="Profile"
        component={ProfileStack}
        options={{ tabBarLabel: t("nav.profile"), tabBarIcon: makeTabIcon("person-outline") }}
      />
    </Tabs.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login"    component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  const { user, role, loading } = useAuth();
  if (loading) return null;

  // Block only a CONFIRMED non-buyer role (inspector). While role is still null
  // (unfetched or a transient error) we fail-open so a real buyer is never
  // locked out; RLS still governs what any account can actually read/write.
  const allowed = role == null || BUYER_ROLES.includes(role);

  return (
    <NavigationContainer theme={navTheme}>
      {user ? (allowed ? <MainTabs /> : <NotAuthorizedScreen />) : <AuthStack />}
    </NavigationContainer>
  );
}
