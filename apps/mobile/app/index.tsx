import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

export default function IndexStartupScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, isIntroCompleted, isSuspended } = useAuth();
  const { theme, scaledFontSize } = useTheme();

  useEffect(() => {
    if (isLoading) return;

    // 1. Suspended or invalid session
    if (isSuspended) {
      router.replace('/(auth)/account-options?suspended=true');
      return;
    }

    // 2. New installation: first launch introduction
    if (!isIntroCompleted) {
      router.replace('/(auth)/intro');
      return;
    }

    // 3. Unauthenticated user: account options screen
    if (!isAuthenticated || !user) {
      router.replace('/(auth)/account-options');
      return;
    }

    // 4. Authenticated, incomplete profile
    const profileComplete = Boolean(
      user.isProfileComplete ||
      (user.firstName && (user.isSingleName || user.lastName) && user.phone && (user.selectedExamIds?.length || (user as any).targetExams?.length))
    );

    if (!profileComplete) {
      router.replace('/(auth)/onboarding');
      return;
    }

    // 5. Authenticated, complete profile: main tabs dashboard
    router.replace('/(tabs)');
  }, [isLoading, isSuspended, isIntroCompleted, isAuthenticated, user, router]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.logoBadge, { backgroundColor: theme.primary }]}>
        <Text style={[styles.logoText, { color: theme.textInverse }]}>S</Text>
      </View>
      <Text style={[styles.brandTitle, { color: theme.text, fontSize: scaledFontSize('2xl') }]}>
        SidPrep
      </Text>
      <Text style={[styles.subtitle, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
        Government Exam Preparation
      </Text>
      <ActivityIndicator size="small" color={theme.primary} style={{ marginTop: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontWeight: '900',
    fontSize: 32,
  },
  brandTitle: {
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
