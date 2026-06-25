import React from "react";
import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Platform, View } from "react-native";
import { COLORS } from "@/src/theme";

export default function AppLayout() {
  const c = COLORS.light;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.onSurfaceMuted,
        tabBarStyle: {
          backgroundColor: c.surfaceSecondary,
          borderTopColor: c.border,
          height: Platform.OS === "ios" ? 86 : 64,
          paddingTop: 6,
          paddingBottom: Platform.OS === "ios" ? 28 : 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Beranda",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cashier"
        options={{
          title: "Kasir",
          tabBarIcon: () => (
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: c.brand,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 6,
                shadowColor: c.brand,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.3,
                shadowRadius: 10,
                elevation: 6,
              }}
            >
              <MaterialCommunityIcons name="cash-register" size={26} color="#fff" />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: "Produk",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="package-variant" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "Lainnya",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="dots-horizontal-circle-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden routes (accessed from More hub) */}
      <Tabs.Screen name="reports" options={{ href: null }} />
      <Tabs.Screen name="cashflow" options={{ href: null }} />
      <Tabs.Screen name="drafts" options={{ href: null }} />
      <Tabs.Screen name="backup" options={{ href: null }} />
      <Tabs.Screen name="dbhealth" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="printer" options={{ href: null }} />
    </Tabs>
  );
}
