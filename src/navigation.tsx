import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";

import { LoginScreen as LoginScreenImpl } from "./screens/LoginScreen";
import { RegisterScreen as RegisterScreenImpl } from "./screens/RegisterScreen";
import { MarketplaceScreen as MarketplaceScreenImpl } from "./screens/MarketplaceScreen";
import { VehicleDetailScreen as VehicleDetailScreenImpl } from "./screens/VehicleDetailScreen";
import { AuctionScreen as AuctionScreenImpl } from "./screens/AuctionScreen";
import { MyBidsScreen as MyBidsScreenImpl } from "./screens/MyBidsScreen";
import { WatchlistScreen as WatchlistScreenImpl } from "./screens/WatchlistScreen";
import { ProfileScreen as ProfileScreenImpl } from "./screens/ProfileScreen";

// React-Navigation's Screen prop types differ from a hand-written screen
// signature.  Cast through `unknown` here once so each screen stays
// strongly typed inside its own file.
type AnyScreen = React.ComponentType<Record<string, unknown>>;
const LoginScreen          = LoginScreenImpl          as unknown as AnyScreen;
const RegisterScreen       = RegisterScreenImpl       as unknown as AnyScreen;
const MarketplaceScreen    = MarketplaceScreenImpl    as unknown as AnyScreen;
const VehicleDetailScreen  = VehicleDetailScreenImpl  as unknown as AnyScreen;
const AuctionScreen        = AuctionScreenImpl        as unknown as AnyScreen;
const MyBidsScreen         = MyBidsScreenImpl         as unknown as AnyScreen;
const WatchlistScreen      = WatchlistScreenImpl      as unknown as AnyScreen;
const ProfileScreen        = ProfileScreenImpl        as unknown as AnyScreen;

import { useAuth } from "./lib/auth";
import { theme } from "./lib/theme";

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

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

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 18, color: focused ? theme.colors.brand : theme.colors.textLight }}>
      {label}
    </Text>
  );
}

function MarketplaceStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MarketplaceHome"  component={MarketplaceScreen} />
      <Stack.Screen name="VehicleDetail"    component={VehicleDetailScreen} options={{ headerShown: true, title: "Vehicle" }} />
      <Stack.Screen name="Auction"          component={AuctionScreen}       options={{ headerShown: true, title: "Auction" }} />
    </Stack.Navigator>
  );
}

function MyBidsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyBidsHome"  component={MyBidsScreen} />
      <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} options={{ headerShown: true, title: "Vehicle" }} />
      <Stack.Screen name="Auction"       component={AuctionScreen}       options={{ headerShown: true, title: "Auction" }} />
    </Stack.Navigator>
  );
}

function WatchlistStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WatchlistHome" component={WatchlistScreen} />
      <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} options={{ headerShown: true, title: "Vehicle" }} />
      <Stack.Screen name="Auction"       component={AuctionScreen}       options={{ headerShown: true, title: "Auction" }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.brand,
        tabBarInactiveTintColor: theme.colors.textLight,
        tabBarStyle: { backgroundColor: theme.colors.white, borderTopColor: theme.colors.border, height: 64, paddingTop: 6, paddingBottom: 10 },
        tabBarLabelStyle: { fontWeight: "600", fontSize: 11 },
      }}
    >
      <Tabs.Screen name="Marketplace" component={MarketplaceStack} options={{ tabBarIcon: ({ focused }) => <TabIcon label="🛒" focused={focused} /> }} />
      <Tabs.Screen name="MyBids"      component={MyBidsStack}      options={{ tabBarLabel: "My bids",  tabBarIcon: ({ focused }) => <TabIcon label="⚖️" focused={focused} /> }} />
      <Tabs.Screen name="Watchlist"   component={WatchlistStack}   options={{ tabBarIcon: ({ focused }) => <TabIcon label="❤️" focused={focused} /> }} />
      <Tabs.Screen name="Profile"     component={ProfileScreen}    options={{ tabBarIcon: ({ focused }) => <TabIcon label="👤" focused={focused} /> }} />
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
  const { user, loading } = useAuth();
  if (loading) return null;
  return (
    <NavigationContainer theme={navTheme}>
      {user ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
