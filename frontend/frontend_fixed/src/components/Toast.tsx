import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { COLORS, RADII, SHADOW, SPACING } from "@/src/theme";

type ToastCtx = { show: (msg: string, type?: "info" | "success" | "error") => void };
const Ctx = createContext<ToastCtx>({ show: () => {} });

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [msg, setMsg] = useState<string | null>(null);
  const [type, setType] = useState<"info" | "success" | "error">("info");
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);

  const show = useCallback((m: string, t: "info" | "success" | "error" = "info") => {
    setMsg(m);
    setType(t);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMsg(null));
    }, 2400);
  }, [opacity]);

  const c = COLORS.light;
  const bg = type === "success" ? c.brand : type === "error" ? c.error : c.secondary;

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {msg && (
        <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
          <View style={[styles.toast, { backgroundColor: bg }]} testID="toast-message">
            <Text style={styles.text}>{msg}</Text>
          </View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
};

export const useToast = () => useContext(Ctx);

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 110,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
  },
  toast: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADII.pill,
    maxWidth: "94%",
    ...SHADOW.card,
  },
  text: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
});
