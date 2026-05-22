import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AuthProvider } from "./src/lib/auth";
import { I18nProvider } from "./src/lib/i18n";
import { CurrencyProvider } from "./src/lib/currency";
import { RootNavigator } from "./src/navigation";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <I18nProvider>
            <CurrencyProvider>
              <StatusBar style="dark" />
              <RootNavigator />
            </CurrencyProvider>
          </I18nProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
