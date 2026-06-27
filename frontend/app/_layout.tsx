import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/contexts/AuthContext";
import { ToastProvider } from "@/src/components/Toast";

// FIX: jangan ignore semua logs - hanya ignore warning library yang sudah diketahui
// agar bug app sendiri tetap terdeteksi di development
LogBox.ignoreLogs([
  "Warning: ReactDOM.render is no longer supported",
  "Warning: Each child in a list",
  // Gorhom bottom-sheet warning yang aman diabaikan
  "Sending `onAnimatedValueUpdate`",
]);
SplashScreen.preventAutoHideAsync();

function RouteGuard() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inApp = segments[0] === "(app)";
    if (!user && inApp) router.replace("/");
    if (user && !inApp) router.replace("/(app)/dashboard");
  }, [user, loading, segments, router]);

  return null;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <AuthProvider>
            <ToastProvider>
              <StatusBar barStyle="light-content" />
              <RouteGuard />
              <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
            </ToastProvider>
          </AuthProvider>
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
