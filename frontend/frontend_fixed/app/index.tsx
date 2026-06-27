import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ImageBackground,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/contexts/AuthContext";
import { COLORS, RADII, SHADOW, SPACING, FONT } from "@/src/theme";
import { useToast } from "@/src/components/Toast";

const BG_URL =
  "https://images.pexels.com/photos/31150088/pexels-photo-31150088.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const c = COLORS.light;

  const onSubmit = async () => {
    if (!username.trim() || !password) {
      toast.show("Lengkapi username & password", "error");
      return;
    }
    setBusy(true);
    const res = await login(username, password);
    setBusy(false);
    if (res.ok) {
      toast.show("Selamat datang!", "success");
      router.replace("/(app)/dashboard");
    } else {
      toast.show(res.error ?? "Gagal masuk", "error");
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <ImageBackground
        source={{ uri: BG_URL }}
        style={styles.bg}
        resizeMode="cover"
        // FIX: graceful fallback jika gambar gagal load (mode offline / no internet)
        onError={() => { /* ImageBackground tetap render, overlay gradient tetap tampil */ }}
      >
        <LinearGradient
          colors={["rgba(46,125,50,0.35)", "rgba(78,52,46,0.85)", "#3B221C"]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.flex}
        >
          <View style={styles.top}>
            <View style={styles.logoBubble}>
              <MaterialCommunityIcons name="coffee" size={36} color="#fff" />
            </View>
            <Text style={styles.appName}>Cemara Kopi</Text>
            <Text style={styles.appTag}>Kasir POS</Text>
          </View>

          <View style={[styles.card, { backgroundColor: c.surfaceSecondary }]}>
            <Text style={[styles.title, { color: c.onSurface }]}>Masuk Akun</Text>
            <Text style={[styles.subtitle, { color: c.onSurfaceMuted }]}>
              Gunakan akun Admin atau Kasir
            </Text>

            <View style={[styles.field, { borderColor: c.border }]}>
              <MaterialCommunityIcons name="account-outline" size={20} color={c.onSurfaceMuted} />
              <TextInput
                testID="login-username-input"
                value={username}
                onChangeText={setUsername}
                placeholder="Username"
                placeholderTextColor={c.onSurfaceMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { color: c.onSurface }]}
              />
            </View>

            <View style={[styles.field, { borderColor: c.border }]}>
              <MaterialCommunityIcons name="lock-outline" size={20} color={c.onSurfaceMuted} />
              <TextInput
                testID="login-password-input"
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={c.onSurfaceMuted}
                secureTextEntry={!showPwd}
                returnKeyType="done"
                onSubmitEditing={onSubmit}
                style={[styles.input, { color: c.onSurface }]}
              />
              <Pressable
                onPress={() => setShowPwd(!showPwd)}
                hitSlop={10}
                testID="login-toggle-password"
              >
                <MaterialCommunityIcons
                  name={showPwd ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={c.onSurfaceMuted}
                />
              </Pressable>
            </View>

            <Pressable
              testID="login-submit-button"
              disabled={busy}
              onPress={onSubmit}
              android_ripple={{ color: "rgba(255,255,255,0.25)" }}
              style={({ pressed }) => [
                styles.cta,
                { backgroundColor: c.brand, opacity: pressed || busy ? 0.85 : 1 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.ctaText}>Masuk</Text>
                  <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
                </>
              )}
            </Pressable>

            <View style={[styles.hint, { backgroundColor: c.brandSoft }]}>
              <MaterialCommunityIcons name="information-outline" size={14} color={c.brand} />
              <Text style={[styles.hintText, { color: c.brand }]}>
                Admin: admin / ******  •  Kasir: kasir / ******
              </Text>
            </View>
          </View>

          <Text style={styles.footer}>v1.0 • 100% Offline • Encrypted Local DB</Text>
        </KeyboardAvoidingView>
      </ImageBackground>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  flex: { flex: 1, justifyContent: "flex-end", padding: SPACING.lg },
  top: { alignItems: "center", marginBottom: SPACING.xl },
  logoBubble: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    marginBottom: SPACING.md,
  },
  appName: {
    fontSize: FONT.sizes.huge,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.4,
  },
  appTag: { color: "rgba(255,255,255,0.85)", marginTop: 4, fontSize: 13, fontWeight: "600" },
  card: {
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
    ...SHADOW.card,
  },
  title: { fontSize: FONT.sizes.xxl, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: -4, marginBottom: SPACING.xs },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    height: 52,
  },
  input: { flex: 1, fontSize: 15, fontWeight: "500" },
  cta: {
    height: 54,
    borderRadius: RADII.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    overflow: "hidden",
  },
  ctaText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: RADII.sm,
    marginTop: 2,
  },
  hintText: { fontSize: 11.5, fontWeight: "600", flex: 1 },
  footer: {
    textAlign: "center",
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
});
