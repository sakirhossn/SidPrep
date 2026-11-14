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
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  GraduationCap,
  AlertCircle,
  KeyRound,
  CheckCircle2,
  X,
} from 'lucide-react-native';
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

  // Forgot password modal state
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

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

  // Student password recovery request - navigates to dedicated forgot-password screen
  const handleOpenForgotPassword = () => {
    router.push({
      pathname: '/(auth)/forgot-password',
      params: { email: email.trim() },
    });
  };

  const handleSubmitForgotPassword = async () => {
    const target = forgotEmail.trim().toLowerCase();
    if (!target || !target.includes('@')) {
      setForgotError('Please enter a valid registered email address.');
      return;
    }

    setForgotLoading(true);
    setForgotError(null);
    try {
      await requestPasswordReset(target);
      setForgotSuccess(true);
    } catch (err: any) {
      setForgotError(err?.message || 'Unable to request password reset. Please try again.');
    } finally {
      setForgotLoading(false);
    }
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
            <TouchableOpacity onPress={handleOpenForgotPassword} accessibilityLabel="Forgot password">
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

      {/* Forgot Password Modal */}
      <Modal
        visible={forgotModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setForgotModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.xl }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconWrap, { backgroundColor: theme.primary + '18' }]}>
                <KeyRound size={24} color={theme.primary} />
              </View>
              <TouchableOpacity
                onPress={() => setForgotModalVisible(false)}
                style={styles.modalCloseBtn}
                accessibilityLabel="Close forgot password modal"
              >
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalTitle, { color: theme.text, fontSize: scaledFontSize('xl') }]}>
              {forgotSuccess ? 'Check Your Inbox' : 'Reset Your Password'}
            </Text>

            <Text style={[styles.modalSubtitle, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
              {forgotSuccess
                ? `If an account is associated with ${forgotEmail}, an official 15-minute reset link has been dispatched to your email.`
                : 'Enter your registered email address and we will send you an official 15-minute password reset link.'}
            </Text>

            {forgotError && (
              <View style={[styles.modalErrorBanner, { backgroundColor: theme.error + '14', borderColor: theme.error + '35' }]}>
                <AlertCircle size={16} color={theme.error} />
                <Text style={[styles.modalErrorText, { color: theme.error, fontSize: scaledFontSize('xs') }]}>
                  {forgotError}
                </Text>
              </View>
            )}

            {!forgotSuccess ? (
              <>
                <View style={[styles.inputBox, { borderColor: theme.border, borderRadius: radii.md, backgroundColor: theme.surfaceVariant, marginTop: 16 }]}>
                  <Mail size={18} color={theme.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: theme.text, fontSize: scaledFontSize('base') }]}
                    placeholder="student@example.com"
                    placeholderTextColor={theme.textMuted}
                    value={forgotEmail}
                    onChangeText={setForgotEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: theme.primary, borderRadius: radii.md, marginTop: 20, minHeight: touchTarget.minTouchSize }]}
                  onPress={handleSubmitForgotPassword}
                  disabled={forgotLoading}
                >
                  {forgotLoading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.primaryBtnText, { fontSize: scaledFontSize('base') }]}>
                      Send Reset Link
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setForgotModalVisible(false)}
                  style={{ alignItems: 'center', marginTop: 14, paddingVertical: 8 }}
                >
                  <Text style={{ color: theme.textMuted, fontSize: scaledFontSize('sm'), fontWeight: '600' }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={{ marginTop: 20 }}>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: theme.primary, borderRadius: radii.md, minHeight: touchTarget.minTouchSize }]}
                  onPress={() => setForgotModalVisible(false)}
                >
                  <Text style={[styles.primaryBtnText, { fontSize: scaledFontSize('base') }]}>
                    Return to Sign In
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    padding: 24,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalTitle: {
    fontWeight: '800',
    marginBottom: 6,
  },
  modalSubtitle: {
    lineHeight: 20,
  },
  modalErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    gap: 8,
  },
  modalErrorText: {
    flex: 1,
    fontWeight: '500',
  },
});
