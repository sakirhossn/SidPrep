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
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react-native';
import { validatePasswordPolicy } from '@sidprep/contracts';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();
  const { validatePasswordResetToken, confirmPasswordReset } = useAuth();
  const params = useLocalSearchParams<{ token?: string; email?: string }>();

  const token = typeof params.token === 'string' ? params.token : '';
  const email = typeof params.email === 'string' ? params.email : '';

  const [validating, setValidating] = useState(true);
  const [tokenState, setTokenState] = useState<'VALID' | 'EXPIRED' | 'ALREADY_USED' | 'INVALID'>('VALID');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!token || !email) {
      setTokenState('INVALID');
      setValidating(false);
      return;
    }

    (async () => {
      try {
        const res = await validatePasswordResetToken(token, email);
        if (!isMounted) return;
        if (res.valid) {
          setTokenState('VALID');
        } else if (res.state === 'EXPIRED') {
          setTokenState('EXPIRED');
        } else if (res.state === 'ALREADY_USED') {
          setTokenState('ALREADY_USED');
        } else {
          setTokenState('INVALID');
        }
      } catch {
        if (isMounted) setTokenState('INVALID');
      } finally {
        if (isMounted) setValidating(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [token, email, validatePasswordResetToken]);

  const policy = validatePasswordPolicy(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async () => {
    if (!policy.isValid) {
      setErrorMsg(policy.errors[0] || 'Password does not meet requirements.');
      return;
    }
    if (!passwordsMatch) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await confirmPasswordReset({
        email: email.trim(),
        resetToken: token,
        newPassword,
      });
      setSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: theme.background, paddingTop: Math.max(insets.top, 20) }]}
    >
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 36) }]}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={[styles.backBtn, { minHeight: touchTarget.minTouchSize, minWidth: touchTarget.minTouchSize }]}
            onPress={() => router.replace('/(auth)/login')}
            accessibilityLabel="Back to sign in"
          >
            <ArrowLeft size={22} color={theme.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <View style={[styles.iconWrapper, { backgroundColor: theme.primary + '18' }]}>
            <KeyRound size={32} color={theme.primary} />
          </View>
          <Text style={[styles.title, { color: theme.text, fontSize: scaledFontSize('2xl') }]}>
            Reset Your Password
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
            {email ? `Account: ${email}` : 'Set a new secure password'}
          </Text>
        </View>

        {validating ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.xl, alignItems: 'center', paddingVertical: 40 }]}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={{ marginTop: 16, color: theme.textMuted, fontSize: scaledFontSize('sm') }}>
              Verifying reset token...
            </Text>
          </View>
        ) : tokenState !== 'VALID' ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.xl, padding: 24, alignItems: 'center' }]}>
            <AlertCircle size={48} color={theme.error} style={{ marginBottom: 12 }} />
            <Text style={[styles.title, { color: theme.text, fontSize: scaledFontSize('lg'), marginBottom: 8 }]}>
              {tokenState === 'EXPIRED' ? 'Reset Link Expired' : tokenState === 'ALREADY_USED' ? 'Link Already Used' : 'Invalid Reset Link'}
            </Text>
            <Text style={{ textAlign: 'center', color: theme.textMuted, fontSize: scaledFontSize('sm'), lineHeight: 20, marginBottom: 20 }}>
              {tokenState === 'EXPIRED'
                ? 'For your security, password reset links expire after 15 minutes. Please request a new link.'
                : tokenState === 'ALREADY_USED'
                ? 'This password reset link has already been used once and cannot be reused.'
                : 'This password reset link is invalid or malformed. Please request a new link from the login screen.'}
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.primary, borderRadius: radii.md, width: '100%', minHeight: touchTarget.minTouchSize }]}
              onPress={() => router.replace('/(auth)/login')}
            >
              <Text style={[styles.primaryBtnText, { fontSize: scaledFontSize('base') }]}>
                Back to Sign In
              </Text>
            </TouchableOpacity>
          </View>
        ) : success ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.xl, padding: 24, alignItems: 'center' }]}>
            <CheckCircle2 size={48} color={theme.success || '#10b981'} style={{ marginBottom: 12 }} />
            <Text style={[styles.title, { color: theme.text, fontSize: scaledFontSize('lg'), marginBottom: 8 }]}>
              Password Updated!
            </Text>
            <Text style={{ textAlign: 'center', color: theme.textMuted, fontSize: scaledFontSize('sm'), lineHeight: 20, marginBottom: 20 }}>
              Your password has been securely updated. You can now sign in with your new credentials on both mobile and web.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.primary, borderRadius: radii.md, width: '100%', minHeight: touchTarget.minTouchSize }]}
              onPress={() => router.replace('/(auth)/login')}
            >
              <Text style={[styles.primaryBtnText, { fontSize: scaledFontSize('base') }]}>
                Sign In Now
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.xl }]}>
            {errorMsg && (
              <View style={[styles.errorBanner, { backgroundColor: theme.error + '14', borderColor: theme.error + '35' }]}>
                <AlertCircle size={16} color={theme.error} style={{ marginTop: 2 }} />
                <Text style={[styles.errorText, { color: theme.error, fontSize: scaledFontSize('xs') }]}>
                  {errorMsg}
                </Text>
              </View>
            )}

            {/* New Password */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                  New Password
                </Text>
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.showHideBtn}>
                  {showPassword ? <EyeOff size={16} color={theme.textMuted} /> : <Eye size={16} color={theme.textMuted} />}
                  <Text style={[styles.showHideText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.inputBox, { borderColor: theme.border, borderRadius: radii.md, backgroundColor: theme.surfaceVariant }]}>
                <Lock size={18} color={theme.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.text, fontSize: scaledFontSize('base') }]}
                  placeholder="At least 8 characters"
                  placeholderTextColor={theme.textMuted}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Confirm Password */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                  Confirm New Password
                </Text>
                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.showHideBtn}>
                  {showConfirm ? <EyeOff size={16} color={theme.textMuted} /> : <Eye size={16} color={theme.textMuted} />}
                  <Text style={[styles.showHideText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                    {showConfirm ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.inputBox, { borderColor: theme.border, borderRadius: radii.md, backgroundColor: theme.surfaceVariant }]}>
                <Lock size={18} color={theme.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.text, fontSize: scaledFontSize('base') }]}
                  placeholder="Re-enter password"
                  placeholderTextColor={theme.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Password Policy Hints */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: theme.textMuted, fontSize: scaledFontSize('xs'), marginBottom: 4 }}>
                Requirements: At least 8 characters, 1 uppercase, 1 lowercase, and 1 number.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.primary, borderRadius: radii.md, minHeight: touchTarget.minTouchSize }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={[styles.primaryBtnText, { fontSize: scaledFontSize('base') }]}>
                    Update Password
                  </Text>
                  <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  backBtn: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    lineHeight: 18,
  },
  card: {
    padding: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontWeight: '600',
    marginBottom: 6,
  },
  showHideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  showHideText: {
    fontWeight: '600',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
