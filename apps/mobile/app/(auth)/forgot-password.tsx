import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  KeyRound,
  Mail,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  ShieldCheck,
} from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();
  const { requestPasswordReset } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState<string>(typeof params.email === 'string' ? params.email : '');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown countdown effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const validateEmail = (val: string) => {
    const trimmed = val.trim().toLowerCase();
    return trimmed.length > 3 && trimmed.includes('@') && trimmed.includes('.');
  };

  const handleSubmit = async () => {
    const targetEmail = email.trim().toLowerCase();
    if (!validateEmail(targetEmail)) {
      setErrorMsg('Please enter a valid registered email address.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      await requestPasswordReset(targetEmail);
      setSuccess(true);
      setCooldown(60); // 60 seconds cooldown for resend
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to request password reset. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    await handleSubmit();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: theme.background, paddingTop: Math.max(insets.top, 20) }]}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 36) }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Header / Back Button */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={[styles.backBtn, { minHeight: touchTarget.minTouchSize, minWidth: touchTarget.minTouchSize }]}
            onPress={() => router.replace('/(auth)/login')}
            accessibilityLabel="Back to sign in"
          >
            <ArrowLeft size={22} color={theme.text} />
          </TouchableOpacity>
        </View>

        {/* Brand / Screen Hero */}
        <View style={styles.heroSection}>
          <View style={[styles.iconBadge, { backgroundColor: theme.primary + '18' }]}>
            <KeyRound size={28} color={theme.primary} />
          </View>
          <Text style={[styles.title, { color: theme.text, fontSize: scaledFontSize('2xl') }]}>
            {success ? 'Check Your Inbox' : 'Forgot Password?'}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
            {success
              ? `An official 15-minute password reset link has been dispatched to your email address.`
              : 'Enter your registered email address and we will send you a secure 15-minute password recovery link.'}
          </Text>
        </View>

        {/* Error Alert */}
        {errorMsg && (
          <View style={[styles.alertBanner, { backgroundColor: theme.error + '14', borderColor: theme.error + '35' }]}>
            <AlertCircle size={18} color={theme.error} style={styles.alertIcon} />
            <Text style={[styles.alertText, { color: theme.error, fontSize: scaledFontSize('xs') }]}>
              {errorMsg}
            </Text>
          </View>
        )}

        {/* Main Content: Form or Success Confirmation */}
        {!success ? (
          <View style={styles.formContainer}>
            {/* Email Input Field */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                Registered Email Address
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: theme.surfaceVariant,
                    borderColor: theme.border,
                    borderRadius: radii.md,
                    minHeight: touchTarget.minTouchSize,
                  },
                ]}
              >
                <Mail size={18} color={theme.textMuted} style={styles.inputLeadingIcon} />
                <TextInput
                  style={[styles.input, { color: theme.text, fontSize: scaledFontSize('base') }]}
                  placeholder="name@example.com"
                  placeholderTextColor={theme.textMuted}
                  value={email}
                  onChangeText={(val) => {
                    setEmail(val);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!loading}
                  accessibilityLabel="Registered email address input"
                />
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                {
                  backgroundColor: theme.primary,
                  borderRadius: radii.md,
                  minHeight: touchTarget.minTouchSize,
                  opacity: loading ? 0.7 : 1,
                },
              ]}
              onPress={handleSubmit}
              disabled={loading}
              accessibilityLabel="Send password reset link"
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <View style={styles.btnRow}>
                  <Text style={[styles.primaryBtnText, { fontSize: scaledFontSize('base') }]}>
                    Send Reset Link
                  </Text>
                  <ArrowRight size={18} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* Option to navigate to Token Screen directly if already received email */}
            <View style={styles.haveTokenRow}>
              <Text style={[styles.haveTokenText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Already received a reset token via email?
              </Text>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/(auth)/reset-password',
                    params: { email: email.trim().toLowerCase() },
                  })
                }
                accessibilityLabel="Enter reset token screen"
              >
                <Text style={[styles.linkText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                  Enter Reset Token
                </Text>
              </TouchableOpacity>
            </View>

            {/* Back to Sign In Link */}
            <TouchableOpacity
              style={styles.backToLoginBtn}
              onPress={() => router.replace('/(auth)/login')}
              accessibilityLabel="Return to sign in"
            >
              <Text style={[styles.backToLoginText, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
                Back to Sign In
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Success State View */
          <View style={styles.successContainer}>
            <View
              style={[
                styles.successCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  borderRadius: radii.lg,
                },
              ]}
            >
              <View style={styles.successHeader}>
                <CheckCircle2 size={32} color={theme.success} />
                <View style={styles.successHeaderText}>
                  <Text style={[styles.successTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                    Recovery Link Sent
                  </Text>
                  <Text
                    style={[styles.successEmailHighlight, { color: theme.primary, fontSize: scaledFontSize('sm') }]}
                  >
                    {email.trim().toLowerCase()}
                  </Text>
                </View>
              </View>

              <View style={[styles.infoBox, { backgroundColor: theme.primary + '12', borderRadius: radii.md }]}>
                <Clock size={16} color={theme.primary} />
                <Text style={[styles.infoText, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                  The recovery link remains valid for <Text style={styles.boldText}>15 minutes</Text> and can be
                  used once.
                </Text>
              </View>

              <Text style={[styles.instructions, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Check your inbox (and spam or promotions folder). Click the link in the email or use the reset token
                below to set a new password.
              </Text>

              {/* Action Buttons */}
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  {
                    backgroundColor: theme.primary,
                    borderRadius: radii.md,
                    minHeight: touchTarget.minTouchSize,
                    marginTop: 16,
                  },
                ]}
                onPress={() =>
                  router.push({
                    pathname: '/(auth)/reset-password',
                    params: { email: email.trim().toLowerCase() },
                  })
                }
                accessibilityLabel="Enter reset token"
              >
                <View style={styles.btnRow}>
                  <Text style={[styles.primaryBtnText, { fontSize: scaledFontSize('base') }]}>
                    Enter Reset Token / Set Password
                  </Text>
                  <ArrowRight size={18} color="#FFFFFF" />
                </View>
              </TouchableOpacity>

              {/* Resend with Cooldown */}
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  {
                    borderColor: theme.border,
                    borderRadius: radii.md,
                    minHeight: touchTarget.minTouchSize,
                    marginTop: 10,
                    opacity: cooldown > 0 ? 0.6 : 1,
                  },
                ]}
                onPress={handleResend}
                disabled={cooldown > 0 || loading}
                accessibilityLabel="Resend password reset email"
              >
                <View style={styles.btnRow}>
                  <RefreshCw size={16} color={theme.text} />
                  <Text style={[styles.secondaryBtnText, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                    {cooldown > 0 ? `Resend Available in ${cooldown}s` : 'Resend Recovery Email'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Back to Sign In Link */}
            <TouchableOpacity
              style={styles.backToLoginBtn}
              onPress={() => router.replace('/(auth)/login')}
              accessibilityLabel="Return to sign in"
            >
              <Text style={[styles.backToLoginText, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
                Back to Sign In
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Security Footer Notice */}
        <View style={styles.securityFooter}>
          <ShieldCheck size={14} color={theme.textMuted} />
          <Text style={[styles.securityNotice, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
            Protected by SidPrep Single-Use Token Security Policy
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -8,
  },
  heroSection: {
    marginBottom: 24,
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  subtitle: {
    lineHeight: 20,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  alertIcon: {
    marginRight: 10,
    flexShrink: 0,
  },
  alertText: {
    flex: 1,
    fontWeight: '500',
    lineHeight: 18,
  },
  formContainer: {
    marginTop: 8,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontWeight: '600',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  inputLeadingIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 48,
  },
  primaryBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontWeight: '600',
  },
  haveTokenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
  },
  haveTokenText: {},
  linkText: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  backToLoginBtn: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 10,
  },
  backToLoginText: {
    fontWeight: '600',
  },
  successContainer: {
    marginTop: 8,
  },
  successCard: {
    borderWidth: 1,
    padding: 20,
  },
  successHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  successHeaderText: {
    flex: 1,
  },
  successTitle: {
    fontWeight: '700',
  },
  successEmailHighlight: {
    fontWeight: '600',
    marginTop: 2,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 14,
  },
  infoText: {
    flex: 1,
    lineHeight: 18,
  },
  boldText: {
    fontWeight: '700',
  },
  instructions: {
    lineHeight: 18,
  },
  securityFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 'auto',
    paddingTop: 32,
  },
  securityNotice: {
    fontWeight: '500',
  },
});
