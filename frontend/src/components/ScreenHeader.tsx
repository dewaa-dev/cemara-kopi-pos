import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { COLORS, RADII, SHADOW, SPACING } from "@/src/theme";

export const ScreenHeader = ({
  title,
  subtitle,
  showBack,
  rightSlot,
  testID,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightSlot?: React.ReactNode;
  testID?: string;
}) => {
  const c = COLORS.light;
  const router = useRouter();
  return (
    <View style={styles.wrap} testID={testID}>
      <LinearGradient colors={[c.brand, c.brandDark]} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={["top"]}>
        <View style={styles.row}>
          {showBack ? (
            <Pressable
              onPress={() => router.back()}
              testID="screen-header-back"
              android_ripple={{ color: "rgba(255,255,255,0.2)", borderless: true }}
              style={styles.backBtn}
              hitSlop={10}
            >
              <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
            </Pressable>
          ) : (
            <View style={{ width: 8 }} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {rightSlot}
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: SPACING.md,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    gap: SPACING.sm,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
});
