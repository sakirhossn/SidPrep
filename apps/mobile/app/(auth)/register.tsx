import React, { useState, useEffect } from 'react';
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
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  User,
  Mail,
  Phone,
  BookOpen,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
} from 'lucide-react-native';
import {
  ExamSummary,
  validatePasswordPolicy,
  estimatePasswordStrength,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '@sidprep/contracts';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();
  const { registerWithPassword, requestOtp } = useAuth();

  // Form Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isSingleName, setIsSingleName] = useState(false);
  const [email, setEmail] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [selectedExams, setSelectedExams] = useState<string[]>(['ssc-cgl']);
  const [primaryExamId, setPrimaryExamId] = useState<string>('ssc-cgl');

  // Password Fields
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Email Verification Sub-flow
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [verificationGrant, setVerificationGrant] = useState<string | null>(null);
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [otpLoading, setOtpLoading] = useState(false);

  // Catalogue
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load backend exams catalogue
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const catalogue = await api.getExams().catch(() => []);
        if (isMounted) {
          const activeExams = Array.isArray(catalogue)
            ? catalogue.filter((e: any) => e.status !== 'INACTIVE')
            : [];
          setExams(activeExams);
          if (activeExams.length > 0) {
            setSelectedExams([activeExams[0]!.id]);
            setPrimaryExamId(activeExams[0]!.id);
          }
        }
      } catch (err) {
        console.warn('Failed to load catalogue:', err);
      } finally {
        if (isMounted) setLoadingExams(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // OTP Countdown
  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  // Editing email clears verified status & grant
  const handleEmailChange = (newEmail: string) => {
    setEmail(newEmail);
    if (isEmailVerified || verificationGrant) {
      setIsEmailVerified(false);
      setVerificationGrant(null);
      setOtp('');
    }
  };

  const toggleExam = (examId: string) => {
    if (selectedExams.includes(examId)) {
      if (selectedExams.length > 1) {
        const updated = selectedExams.filter((id) => id !== examId);
        setSelectedExams(updated);
        if (primaryExamId === examId) {
          setPrimaryExamId(updated[0]!);
        }
      } else {
        Alert.alert('Selection Required', 'At least one target exam must remain selected.');
      }
    } else {
      const updated = [...selectedExams, examId];
      setSelectedExams(updated);
      if (!primaryExamId) {
        setPrimaryExamId(examId);
      }
    }
  };

  // Request Email Verification OTP
  const handleRequestEmailOtp = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      Alert.alert('Invalid Email', 'Please enter a valid email address before verifying.');
      return;
    }

    setOtpLoading(true);
    setErrorMessage(null);
    try {
      const res = await requestOtp(email.trim().toLowerCase(), phone.trim() || undefined);
      setOtpModalVisible(true);
      setCountdown(res.resendAvailableInSeconds || 60);
      Alert.alert('Verification Code Sent', res.message || 'Check your email inbox for the 6-digit code.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not send verification email.');
    } finally {
      setOtpLoading(false);
    }
  };

  // Confirm Email OTP & capture verification grant
  const handleConfirmOtp = async () => {
    if (otp.trim().length !== 6) {
      Alert.alert('Incomplete Code', 'Please enter the 6-digit verification code.');
      return;
    }

    setOtpLoading(true);
    try {
      const res = await api.verifyEmailOtp(email.trim().toLowerCase(), otp.trim());
      if (res.verificationGrant) {
        setVerificationGrant(res.verificationGrant);
        setIsEmailVerified(true);
        setOtpModalVisible(false);
        Alert.alert('Email Verified', 'Your email address has been verified successfully!');
      } else {
        throw new Error('Verification grant missing from server.');
      }
    } catch (err: any) {
      Alert.alert('Verification Failed', err.message || 'Invalid or expired verification code.');
    } finally {
      setOtpLoading(false);
    }
  };

  // Password Policy Analysis
  const passwordPolicy = validatePasswordPolicy(password);
  const passwordStrength = estimatePasswordStrength(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  // Final Registration Validation
  const canSubmit =
    firstName.trim().length > 0 &&
    (isSingleName || lastName.trim().length > 0) &&
    email.trim().length > 0 &&
    isEmailVerified &&
    Boolean(verificationGrant) &&
    phone.replace(/[\s-]/g, '').trim().length >= 7 &&
    selectedExams.length > 0 &&
    passwordPolicy.isValid &&
    passwordsMatch &&
    !submitting;

  const handleRegisterSubmit = async () => {
    if (!isEmailVerified || !verificationGrant) {
      Alert.alert('Verification Required', 'Please verify your email address before creating your account.');
      return;
    }

    if (!passwordPolicy.isValid) {
      Alert.alert('Password Policy', passwordPolicy.errors[0] || 'Password does not meet requirements.');
      return;
    }

    if (!passwordsMatch) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        firstName: firstName.trim(),
        lastName: isSingleName ? '' : lastName.trim(),
        isSingleName,
        email: email.trim().toLowerCase(),
        phone: phone.replace(/[\s-]/g, '').trim(),
        phoneCountryCode: phoneCountryCode.trim() || '+91',
        targetExamIds: selectedExams,
        primaryExamId: primaryExamId || selectedExams[0]!,
        password,
        verificationGrant,
      };

      const res = await registerWithPassword(payload);
      if (res.isProfileComplete) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(auth)/onboarding');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed. Please review your details.');
      Alert.alert('Registration Error', err.message || 'Unable to complete registration.');
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
        {/* Top Header */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={[styles.backBtn, { minHeight: touchTarget.minTouchSize, minWidth: touchTarget.minTouchSize }]}
            onPress={() => router.replace('/(auth)/login')}
          >
            <ArrowLeft size={22} color={theme.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text, fontSize: scaledFontSize('2xl') }]}>
            Create Student Account
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
            Begin your personalized exam journey with SidPrep
          </Text>
        </View>

        {errorMessage && (
          <View style={[styles.errorBanner, { backgroundColor: theme.error + '14', borderColor: theme.error + '35' }]}>
            <AlertCircle size={18} color={theme.error} style={{ marginTop: 2 }} />
            <Text style={[styles.errorText, { color: theme.error, fontSize: scaledFontSize('xs') }]}>
              {errorMessage}
            </Text>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.xl }]}>
          {/* Names */}
          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                First Name *
              </Text>
              <View style={[styles.inputBox, { borderColor: theme.border, borderRadius: radii.md, backgroundColor: theme.surfaceVariant }]}>
                <TextInput
                  style={[styles.input, { color: theme.text, fontSize: scaledFontSize('base') }]}
                  placeholder="Rahul"
                  placeholderTextColor={theme.textMuted}
                  value={firstName}
                  onChangeText={setFirstName}
                />
              </View>
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                Last Name {!isSingleName && '*'}
              </Text>
              <View style={[styles.inputBox, { borderColor: theme.border, borderRadius: radii.md, backgroundColor: theme.surfaceVariant }]}>
                <TextInput
                  style={[styles.input, { color: theme.text, fontSize: scaledFontSize('base'), opacity: isSingleName ? 0.4 : 1 }]}
                  placeholder={isSingleName ? 'Single name' : 'Sharma'}
                  placeholderTextColor={theme.textMuted}
                  value={isSingleName ? '' : lastName}
                  onChangeText={setLastName}
                  editable={!isSingleName}
                />
              </View>
            </View>
          </View>

          {/* Single Name Switch */}
          <View style={styles.singleNameRow}>
            <Switch
              value={isSingleName}
              onValueChange={(val) => {
                setIsSingleName(val);
                if (val) setLastName('');
              }}
              trackColor={{ false: theme.border, true: theme.primary }}
            />
            <Text style={[styles.singleNameText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              I have only a single legal name
            </Text>
          </View>

          {/* Mobile Number */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
              Mobile Number *
            </Text>
            <View style={[styles.inputBox, { borderColor: theme.border, borderRadius: radii.md, backgroundColor: theme.surfaceVariant }]}>
              <Text style={[styles.countryCode, { color: theme.textMuted, fontSize: scaledFontSize('base') }]}>
                +91
              </Text>
              <TextInput
                style={[styles.input, { color: theme.text, fontSize: scaledFontSize('base') }]}
                placeholder="9876543210"
                placeholderTextColor={theme.textMuted}
                value={phone}
                onChangeText={(text) => setPhone(text.replace(/\D/g, ''))}
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>
          </View>

          {/* Email Address with Verify Button */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                Email Address *
              </Text>
              {isEmailVerified && (
                <View style={styles.verifiedBadge}>
                  <CheckCircle2 size={14} color="#10B981" />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              )}
            </View>
            <View style={styles.emailRow}>
              <View style={[styles.inputBox, { flex: 1, borderColor: theme.border, borderRadius: radii.md, backgroundColor: theme.surfaceVariant }]}>
                <Mail size={18} color={theme.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.text, fontSize: scaledFontSize('base') }]}
                  placeholder="student@example.com"
                  placeholderTextColor={theme.textMuted}
                  value={email}
                  onChangeText={handleEmailChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              {!isEmailVerified && (
                <TouchableOpacity
                  style={[styles.verifyBtn, { backgroundColor: theme.primary, borderRadius: radii.md }]}
                  onPress={handleRequestEmailOtp}
                  disabled={otpLoading || !email}
                >
                  {otpLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.verifyBtnText}>Verify</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Exam Selection */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
              Target Exams *
            </Text>
            <View style={styles.examsList}>
              {(exams.length > 0 ? exams : [{ id: 'ssc-cgl', code: 'ssc-cgl', title: 'SSC CGL' }, { id: 'rrb-ntpc', code: 'rrb-ntpc', title: 'RRB NTPC' }]).map((exam: any) => {
                const isSelected = selectedExams.includes(exam.id) || selectedExams.includes(exam.code);
                return (
                  <TouchableOpacity
                    key={exam.id}
                    style={[
                      styles.examChip,
                      {
                        backgroundColor: isSelected ? theme.primary + '18' : theme.surfaceVariant,
                        borderColor: isSelected ? theme.primary : theme.border,
                        borderRadius: radii.md,
                      },
                    ]}
                    onPress={() => toggleExam(exam.id)}
                  >
                    <Text style={[styles.examChipText, { color: isSelected ? theme.primary : theme.text, fontSize: scaledFontSize('xs') }]}>
                      {exam.title}
                    </Text>
                    {isSelected && <Check size={14} color={theme.primary} style={{ marginLeft: 4 }} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                Password *
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
                placeholder="Create password (8-14 chars)"
                placeholderTextColor={theme.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Confirm Password */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                Confirm Password *
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
              />
            </View>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <Text style={{ color: theme.error, fontSize: scaledFontSize('xs'), marginTop: 4 }}>
                Passwords do not match.
              </Text>
            )}
          </View>

          {/* Password Live Checklist & Strength Indicator */}
          {password.length > 0 && (
            <View style={[styles.policyCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border, borderRadius: radii.md }]}>
              <View style={styles.strengthRow}>
                <Text style={[styles.strengthLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  Strength: <Text style={{ color: passwordStrength.level === 'Strong' ? '#10B981' : passwordStrength.level === 'Medium' ? '#F59E0B' : '#EF4444', fontWeight: '700' }}>{passwordStrength.level}</Text>
                </Text>
              </View>

              <View style={styles.checklist}>
                <View style={styles.checkItem}>
                  {password.length > PASSWORD_MAX_LENGTH ? (
                    <X size={14} color="#EF4444" />
                  ) : passwordPolicy.criteria.minLength && passwordPolicy.criteria.maxLength ? (
                    <Check size={14} color="#10B981" />
                  ) : (
                    <Text style={{ color: theme.textMuted, fontSize: 10 }}>○</Text>
                  )}
                  <Text style={[styles.checkText, { color: password.length > PASSWORD_MAX_LENGTH ? '#EF4444' : theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                    8–14 characters {password.length > PASSWORD_MAX_LENGTH && `(Too long: max 14)`}
                  </Text>
                </View>

                <View style={styles.checkItem}>
                  {passwordPolicy.criteria.hasUppercase ? <Check size={14} color="#10B981" /> : <Text style={{ color: theme.textMuted, fontSize: 10 }}>○</Text>}
                  <Text style={[styles.checkText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                    At least one uppercase letter (A–Z)
                  </Text>
                </View>

                <View style={styles.checkItem}>
                  {passwordPolicy.criteria.hasLowercase ? <Check size={14} color="#10B981" /> : <Text style={{ color: theme.textMuted, fontSize: 10 }}>○</Text>}
                  <Text style={[styles.checkText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                    At least one lowercase letter (a–z)
                  </Text>
                </View>

                <View style={styles.checkItem}>
                  {passwordPolicy.criteria.hasNumber ? <Check size={14} color="#10B981" /> : <Text style={{ color: theme.textMuted, fontSize: 10 }}>○</Text>}
                  <Text style={[styles.checkText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                    At least one number (0–9)
                  </Text>
                </View>

                <View style={styles.checkItem}>
                  {passwordPolicy.criteria.hasSymbol ? <Check size={14} color="#10B981" /> : <Text style={{ color: theme.textMuted, fontSize: 10 }}>○</Text>}
                  <Text style={[styles.checkText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                    At least one special symbol (!@#$...)
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.primary, borderRadius: radii.md, minHeight: touchTarget.minTouchSize, opacity: canSubmit ? 1 : 0.5 }]}
            onPress={handleRegisterSubmit}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={[styles.primaryBtnText, { fontSize: scaledFontSize('base') }]}>
                  Create Account
                </Text>
                <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Switch to Login */}
        <View style={styles.loginPrompt}>
          <Text style={[styles.promptText, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
            Already have an account?
          </Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
            <Text style={[styles.loginLink, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
              Sign In
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* OTP Verification Modal */}
      {otpModalVisible && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.xl }]}>
            <Text style={[styles.modalTitle, { color: theme.text, fontSize: scaledFontSize('lg') }]}>
              Verify Email Address
            </Text>
            <Text style={[styles.modalSubtitle, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              Enter the 6-digit verification code sent to {email}:
            </Text>

            <TextInput
              style={[styles.otpInput, { borderColor: theme.border, backgroundColor: theme.surfaceVariant, color: theme.text, borderRadius: radii.md }]}
              value={otp}
              onChangeText={(text) => setOtp(text.replace(/\D/g, ''))}
              placeholder="000000"
              placeholderTextColor={theme.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: theme.border, borderRadius: radii.md }]}
                onPress={() => setOtpModalVisible(false)}
              >
                <Text style={[styles.modalCancelText, { color: theme.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: theme.primary, borderRadius: radii.md }]}
                onPress={handleConfirmOtp}
                disabled={otpLoading || otp.length !== 6}
              >
                {otpLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Confirm Code</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
    marginBottom: 20,
  },
  title: {
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 4,
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
    flex: 1,
    lineHeight: 18,
    fontWeight: '500',
  },
  card: {
    padding: 20,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
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
  countryCode: {
    marginRight: 8,
    fontWeight: '700',
  },
  input: {
    flex: 1,
    paddingVertical: 8,
  },
  singleNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  singleNameText: {},
  emailRow: {
    flexDirection: 'row',
    gap: 8,
  },
  verifyBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  verifyBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 12,
  },
  examsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  examChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  examChipText: {
    fontWeight: '600',
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
  policyCard: {
    padding: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  strengthRow: {
    marginBottom: 8,
  },
  strengthLabel: {},
  checklist: {
    gap: 6,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkText: {},
  primaryBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  loginPrompt: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    gap: 6,
  },
  promptText: {},
  loginLink: {
    fontWeight: '700',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    padding: 24,
    borderWidth: 1,
  },
  modalTitle: {
    fontWeight: '800',
    marginBottom: 4,
  },
  modalSubtitle: {
    marginBottom: 16,
  },
  otpInput: {
    borderWidth: 1,
    height: 52,
    fontSize: 24,
    letterSpacing: 10,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 20,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelText: {
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 2,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
