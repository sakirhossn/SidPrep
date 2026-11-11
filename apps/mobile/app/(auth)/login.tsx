import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, GraduationCap, AlertCircle, KeyRound } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();
  const { loginWithPassword, requestPasswordReset, requestPasswordSetup } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [passwordNotSet, setPasswordNotSet] = useState(false);

  // Normal Student Email + Password Login
  const handlePasswordLogin = async () => {
    setErrorMsg(null);
    setPasswordNotSet(false);

    if (!email || !email.includes('@')) {
      setErrorMsg('Please enter a valid student email address.');
      Alert.alert('Invalid Email', 'Please enter a valid student email address.');
      return;
    }

    if (!password) {
      setErrorMsg('Please enter your account password.');
      Alert.alert('Missing Password', 'Please enter your account password.');
      return;
    }

    setLoading(true);
    try {
      const res = await loginWithPassword(email.trim().toLowerCase(), password);
      if (res.isProfileComplete) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(auth)/onboarding');
      }
    } catch (err: any) {
      if (err?.code === 'ACCOUNT_SUSPENDED') {
        router.replace('/(auth)/account-options?suspended=true');
        return;
      }
      if (err?.code === 'PASSWORD_NOT_SET') {
        setPasswordNotSet(true);
        setErrorMsg('You have not set a password for this account yet. Tap below to receive a setup link.');
        return;
      }
      const msg = err.message || 'Login failed. Please check your credentials.';
      setErrorMsg(msg);
      Alert.alert('Sign In Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  // Request password setup link for existing OTP students
  const handleRequestSetup = async () => {
    if (!email || !email.includes('@')) {
      Alert.alert('Email Required', 'Please enter your registered email address.');
      return;
    }

    setLoading(true);
    try {
      await requestPasswordSetup(email.trim().toLowerCase());
      Alert.alert(
        'Setup Link Dispatched',
        'If an eligible account exists, an expiring link to configure your password has been sent to your email.'
      );
    } catch (err: any) {
      Alert.alert('Request Failed', err.message || 'Unable to request password setup.');
    } finally {
      setLoading(false);
    }
  };

  // Student password recovery request
  const handleForgotPassword = () => {
    Alert.prompt
      ? Alert.prompt(
          'Reset Password',
          'Enter your registered email address to receive an expiring 15-minute reset link:',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Send Reset Link',
              onPress: async (enteredEmail?: string) => {
                const target = enteredEmail || email;
                if (!target || !target.includes('@')) {
                  Alert.alert('Invalid Email', 'Please provide a valid registered email.');
                  return;
                }
                try {
                  await requestPasswordReset(target.trim().toLowerCase());
                  Alert.alert(
                    'Reset Link Sent',
                    'If an eligible account exists for this email address, a password-reset link will be sent.'
                  );
                } catch {
                  Alert.alert(
                    'Reset Link Sent',
                    'If an eligible account exists for this email address, a password-reset link will be sent.'
                  );
                }
              },
            },
          ],
          'plain-text',
          email
        )
      : (async () => {
          if (!email || !email.includes('@')) {
            Alert.alert('Email Required', 'Please enter your email above to request a reset link.');
            return;
          }
          try {
            await requestPasswordReset(email.trim().toLowerCase());
          } finally {
            Alert.alert(
              'Reset Link Sent',
              'If an eligible account exists for this email address, a password-reset link will be sent.'
            );
          }
        })();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: theme.background, paddingTop: Math.max(insets.top, 20) }]}
    >
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 36) }]}>
        {/* Top Header */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={[styles.backBtn, { minHeight: touchTarget.minTouchSize, minWidth: touchTarget.minTouchSize }]}
            onPress={() => router.replace('/(auth)/intro')}
            accessibilityLabel="Go back to introduction"
          >
            <ArrowLeft size={22} color={theme.text} />
          </TouchableOpacity>
        </View>

        {/* Brand Banner */}
        <View style={styles.header}>
          <View style={[styles.iconWrapper, { backgroundColor: theme.primary + '18' }]}>
            <GraduationCap size={32} color={theme.primary} />
          </View>
          <Text style={[styles.title, { color: theme.text, fontSize: scaledFontSize('2xl') }]}>
            Welcome to SidPrep
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
            Sign in with your email and password
          </Text>
        </View>

        {/* Error / Alert banner */}
        {errorMsg && (
          <View style={[styles.errorBanner, { backgroundColor: theme.error + '14', borderColor: theme.error + '35' }]}>
            <AlertCircle size={18} color={theme.error} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.errorText, { color: theme.error, fontSize: scaledFontSize('xs') }]}>
                {errorMsg}
              </Text>
              {passwordNotSet && (
                <TouchableOpacity onPress={handleRequestSetup} style={{ marginTop: 6 }}>
                  <Text style={{ color: theme.primary, fontWeight: '700', fontSize: scaledFontSize('xs') }}>
                    Tap here to email yourself a password setup link →
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Form Card */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.xl }]}>
          {/* Email Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
              Email Address
            </Text>
            <View style={[styles.inputBox, { borderColor: theme.border, borderRadius: radii.md, backgroundColor: theme.surfaceVariant }]}>
              <Mail size={18} color={theme.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text, fontSize: scaledFontSize('base') }]}
                placeholder="student@example.com"
                placeholderTextColor={theme.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
              />
            </View>
          </View>

          {/* Password Input */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                Password
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
                placeholder="Enter password"
                placeholderTextColor={theme.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Forgot Password Link */}
          <View style={styles.forgotRow}>
            <TouchableOpacity onPress={handleForgotPassword}>
              <Text style={[styles.forgotLink, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                Forgot password?
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sign In Button */}
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.primary, borderRadius: radii.md, minHeight: touchTarget.minTouchSize }]}
            onPress={handlePasswordLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={[styles.primaryBtnText, { fontSize: scaledFontSize('base') }]}>
                  Sign In
                </Text>
                <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Switch to Registration */}
        <View style={styles.registerPrompt}>
          <Text style={[styles.promptText, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
            Don&apos;t have an account yet?
          </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={[styles.registerLink, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
              Create New Account
            </Text>
          </TouchableOpacity>
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
    gap: 10,
  },
  errorText: {
    lineHeight: 18,
    fontWeight: '500',
  },
  card: {
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
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
    marginBottom: 6,
  },
  showHideText: {
    fontWeight: '500',
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
  forgotRow: {
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  forgotLink: {
    fontWeight: '600',
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
  registerPrompt: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    gap: 6,
  },
  promptText: {},
  registerLink: {
    fontWeight: '700',
  },
});
