import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UserPlus, LogIn, AlertTriangle, ShieldCheck, Sparkles } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

export default function AccountOptionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ suspended?: string }>();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();
  const { isSuspended } = useAuth();

  const showSuspendedNotice = isSuspended || params.suspended === 'true';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 24),
            paddingBottom: Math.max(insets.bottom, 28),
          },
        ]}
      >
        {/* Brand Banner */}
        <View style={styles.brandRow}>
          <View style={[styles.logoBadge, { backgroundColor: theme.primary }]}>
            <Text style={[styles.logoText, { color: theme.textInverse }]}>S</Text>
          </View>
          <Text style={[styles.brandTitle, { color: theme.text, fontSize: scaledFontSize('2xl') }]}>
            SidPrep
          </Text>
          <View style={[styles.versionPill, { backgroundColor: theme.primaryContainer }]}>
            <Text style={[styles.versionText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
              2.0
            </Text>
          </View>
        </View>

        {/* Suspended Alert Banner if applicable */}
        {showSuspendedNotice && (
          <View
            style={[
              styles.alertBox,
              {
                backgroundColor: theme.errorBg || '#FEE2E2',
                borderColor: theme.error || '#DC2626',
                borderRadius: radii.md,
              },
            ]}
          >
            <AlertTriangle size={22} color={theme.error || '#DC2626'} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.alertTitle,
                  { color: theme.error || '#DC2626', fontSize: scaledFontSize('sm') },
                ]}
              >
                Account Suspended
              </Text>
              <Text
                style={[
                  styles.alertBody,
                  { color: theme.text, fontSize: scaledFontSize('xs') },
                ]}
              >
                Your student account has been suspended by an administrator. Please reach out to student support for verification.
              </Text>
            </View>
          </View>
        )}

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={[styles.sparkleRow, { backgroundColor: theme.surfaceVariant }]}>
            <Sparkles size={14} color={theme.primary} />
            <Text style={[styles.sparkleText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
              SSC • RRB • WBPSC • IBPS
            </Text>
          </View>

          <Text style={[styles.heroHeading, { color: theme.text, fontSize: scaledFontSize('3xl') }]}>
            Start Your Government Exam Journey
          </Text>
          <Text style={[styles.heroSubheading, { color: theme.textMuted, fontSize: scaledFontSize('base') }]}>
            Create your personalized preparation account or log in to continue your active mock tests, study planner, and daily targets.
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          {/* Create Account Primary Button */}
          <TouchableOpacity
            onPress={() => router.push('/(auth)/register')}
            style={[
              styles.primaryAction,
              {
                backgroundColor: theme.primary,
                borderRadius: radii.lg,
                minHeight: Math.max(touchTarget.minTouchSize, 52),
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Create a new student account"
          >
            <UserPlus size={20} color={theme.textInverse} style={{ marginRight: 10 }} />
            <Text style={[styles.primaryActionText, { color: theme.textInverse, fontSize: scaledFontSize('base') }]}>
              Create Account
            </Text>
          </TouchableOpacity>

          {/* Log In Secondary Button */}
          <TouchableOpacity
            onPress={() => router.push('/(auth)/login')}
            style={[
              styles.secondaryAction,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderStrong,
                borderRadius: radii.lg,
                minHeight: Math.max(touchTarget.minTouchSize, 52),
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Log into your existing student account"
          >
            <LogIn size={20} color={theme.text} style={{ marginRight: 10 }} />
            <Text style={[styles.secondaryActionText, { color: theme.text, fontSize: scaledFontSize('base') }]}>
              Log In
            </Text>
          </TouchableOpacity>
        </View>

        {/* Security & Integrity Footer */}
        <View style={styles.footerSection}>
          <ShieldCheck size={18} color={theme.primary} />
          <Text style={[styles.footerText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
            Verified syllabus patterns, strict exam timing, and encrypted authentication credentials.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontWeight: '900',
    fontSize: 20,
  },
  brandTitle: {
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  versionPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  versionText: {
    fontWeight: '800',
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    marginBottom: 20,
  },
  alertTitle: {
    fontWeight: '700',
    marginBottom: 2,
  },
  alertBody: {
    lineHeight: 18,
  },
  heroSection: {
    paddingVertical: 20,
  },
  sparkleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginBottom: 16,
  },
  sparkleText: {
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  heroHeading: {
    fontWeight: '800',
    lineHeight: 38,
    marginBottom: 12,
  },
  heroSubheading: {
    lineHeight: 24,
  },
  actionsContainer: {
    gap: 14,
    paddingVertical: 20,
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryActionText: {
    fontWeight: '700',
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderWidth: 1.5,
  },
  secondaryActionText: {
    fontWeight: '700',
  },
  footerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 16,
  },
  footerText: {
    flex: 1,
    lineHeight: 18,
  },
});
