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
  KeyRound,
  ArrowRight,
  ArrowLeft,
  Check,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react-native';
import { ExamSummary, StudentRegistrationDraft } from '@sidprep/contracts';
import { api } from '../../src/api/client';
import { secureStorage } from '../../src/services/secureStorage';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();
  const { requestOtp, verifyOtp } = useAuth();

  // Multi-step flow: 'DETAILS' -> 'OTP'
  const [step, setStep] = useState<'DETAILS' | 'OTP'>('DETAILS');

  // Form Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isSingleName, setIsSingleName] = useState(false);
  const [email, setEmail] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [selectedExams, setSelectedExams] = useState<string[]>([]);
  const [primaryExamId, setPrimaryExamId] = useState<string>('');

  // Catalogue
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);

  // OTP State
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load backend exams catalogue and restore pending draft (restart recovery)
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [catalogue, savedDraft] = await Promise.all([
          api.getExams().catch(() => []),
          secureStorage.getRegistrationDraft().catch(() => null),
        ]);

        if (isMounted) {
          // Filter to active exams
          const activeExams = Array.isArray(catalogue)
            ? catalogue.filter((e: any) => e.status !== 'INACTIVE')
            : [];
          setExams(activeExams);

          // Restore saved draft if user previously entered details
          if (savedDraft) {
            if (savedDraft.firstName) setFirstName(savedDraft.firstName);
            if (savedDraft.lastName) setLastName(savedDraft.lastName);
            if (typeof savedDraft.isSingleName === 'boolean') setIsSingleName(savedDraft.isSingleName);
            if (savedDraft.email) setEmail(savedDraft.email);
            if (savedDraft.phoneCountryCode) setPhoneCountryCode(savedDraft.phoneCountryCode);
            if (savedDraft.phone) setPhone(savedDraft.phone);
            if (savedDraft.targetExamIds?.length) setSelectedExams(savedDraft.targetExamIds);
            if (savedDraft.primaryExamId) setPrimaryExamId(savedDraft.primaryExamId);
          } else if (activeExams.length > 0 && selectedExams.length === 0) {
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

  // Resend Countdown
  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

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

  const validateForm = (): string | null => {
    if (!firstName.trim()) {
      return 'Please enter your legal first name.';
    }
    if (!isSingleName && !lastName.trim()) {
      return 'Please enter your last name or select the single legal name option.';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      return 'Please enter a valid email address.';
    }
    const cleanPhone = phone.replace(/[\s-]/g, '');
    if (!cleanPhone || cleanPhone.length < 5 || cleanPhone.length > 15 || !/^\d+$/.test(cleanPhone)) {
      return 'Please enter a valid mobile phone number.';
    }
    if (selectedExams.length === 0) {
      return 'Please choose at least one preparation exam from the catalogue.';
    }
    return null;
  };

  const handleRequestVerification = async () => {
    setErrorMessage(null);
    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      Alert.alert('Incomplete Profile', validationError);
      return;
    }

    const draft: StudentRegistrationDraft = {
      firstName: firstName.trim(),
      lastName: isSingleName ? '' : lastName.trim(),
      isSingleName,
      email: email.trim().toLowerCase(),
      phoneCountryCode: phoneCountryCode.trim() || '+91',
      phone: phone.replace(/[\s-]/g, '').trim(),
      targetExamIds: selectedExams,
      primaryExamId: primaryExamId || selectedExams[0]!,
      preferredLanguage: 'en',
    };

    setSubmitting(true);
    try {
      const res = await requestOtp(draft.email, draft.phone, draft);
      setStep('OTP');
      setCountdown(res.resendAvailableInSeconds || 30);
      Alert.alert('Verification Code Sent', res.message || 'Check your email inbox for your 6-digit code.');
    } catch (err: any) {
      const msg = err.message || 'Unable to dispatch verification code. Please retry.';
      setErrorMessage(msg);
      Alert.alert('Registration Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyAndComplete = async () => {
    setErrorMessage(null);
    if (otp.length !== 6) {
      setErrorMessage('Please enter the complete 6-digit verification code.');
      return;
    }

    const draft: StudentRegistrationDraft = {
      firstName: firstName.trim(),
      lastName: isSingleName ? '' : lastName.trim(),
      isSingleName,
      email: email.trim().toLowerCase(),
      phoneCountryCode: phoneCountryCode.trim() || '+91',
      phone: phone.replace(/[\s-]/g, '').trim(),
      targetExamIds: selectedExams,
      primaryExamId: primaryExamId || selectedExams[0]!,
      preferredLanguage: 'en',
    };

    setSubmitting(true);
    try {
      const result = await verifyOtp(draft.email, otp.trim(), draft);
      if (result.isProfileComplete) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(auth)/onboarding');
      }
    } catch (err: any) {
      const msg = err.message || 'Verification failed. The code may be incorrect or expired.';
      setErrorMessage(msg);
      Alert.alert('Verification Failed', msg);
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
        {/* Navigation & Header */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => {
              if (step === 'OTP') {
                setStep('DETAILS');
              } else {
                router.back();
              }
            }}
            style={[styles.backButton, { minHeight: touchTarget.minTouchSize }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={20} color={theme.text} />
            <Text style={[styles.backButtonText, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
              {step === 'OTP' ? 'Edit Details' : 'Back'}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.stepIndicator, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
            {step === 'DETAILS' ? 'STEP 1 OF 2: PROFILE' : 'STEP 2 OF 2: VERIFICATION'}
          </Text>
        </View>

        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text, fontSize: scaledFontSize('2xl') }]}>
            {step === 'DETAILS' ? 'Create Candidate Account' : 'Verify Your Email'}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
            {step === 'DETAILS'
              ? 'Enter your legal student details. Your selected target exam personalizes your syllabus and mocks.'
              : `A 6-digit one-time passcode was dispatched to ${email}.`}
          </Text>
        </View>

        {/* Error Alert Box */}
        {errorMessage && (
          <View
            style={[
              styles.errorCard,
              {
                backgroundColor: theme.errorBg || '#FEE2E2',
                borderColor: theme.error || '#DC2626',
                borderRadius: radii.md,
              },
            ]}
          >
            <AlertCircle size={18} color={theme.error || '#DC2626'} style={{ marginRight: 8 }} />
            <Text style={[styles.errorCardText, { color: theme.error || '#DC2626', fontSize: scaledFontSize('xs') }]}>
              {errorMessage}
            </Text>
          </View>
        )}

        {/* Step 1: Profile & Exam Form */}
        {step === 'DETAILS' ? (
          <View style={styles.formCard}>
            {/* First Name */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                First Name (Required)
              </Text>
              <View style={[styles.inputRow, { borderColor: theme.borderStrong, backgroundColor: theme.surface, borderRadius: radii.md }]}>
                <User size={18} color={theme.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.text, fontSize: scaledFontSize('base') }]}
                  placeholder="e.g. Rahul / Ananya"
                  placeholderTextColor={theme.textMuted}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* Single Name Toggle */}
            <View style={styles.singleNameRow}>
              <Text style={[styles.singleNameLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                I have only one legal name (no surname)
              </Text>
              <Switch
                value={isSingleName}
                onValueChange={(val) => {
                  setIsSingleName(val);
                  if (val) setLastName('');
                }}
                trackColor={{ false: theme.border, true: theme.primary }}
              />
            </View>

            {/* Last Name (if not single name) */}
            {!isSingleName && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                  Last Name (Required)
                </Text>
                <View style={[styles.inputRow, { borderColor: theme.borderStrong, backgroundColor: theme.surface, borderRadius: radii.md }]}>
                  <User size={18} color={theme.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: theme.text, fontSize: scaledFontSize('base') }]}
                    placeholder="e.g. Sharma / Das"
                    placeholderTextColor={theme.textMuted}
                    value={lastName}
                    onChangeText={setLastName}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            {/* Email Address */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                Email Address (Required for verification)
              </Text>
              <View style={[styles.inputRow, { borderColor: theme.borderStrong, backgroundColor: theme.surface, borderRadius: radii.md }]}>
                <Mail size={18} color={theme.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.text, fontSize: scaledFontSize('base') }]}
                  placeholder="student@example.com"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>
            </View>

            {/* Phone Number */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                Mobile Number (Required)
              </Text>
              <View style={[styles.inputRow, { borderColor: theme.borderStrong, backgroundColor: theme.surface, borderRadius: radii.md }]}>
                <View style={styles.countryCodeBadge}>
                  <Text style={[styles.countryCodeText, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
                    {phoneCountryCode}
                  </Text>
                </View>
                <TextInput
                  style={[styles.input, { color: theme.text, fontSize: scaledFontSize('base') }]}
                  placeholder="9876543210"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  maxLength={15}
                />
              </View>
            </View>

            {/* Preparation Target Exam Catalogue */}
            <View style={styles.inputGroup}>
              <View style={styles.catalogueHeader}>
                <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                  Preparation Target Exam(s) (Database Catalogue)
                </Text>
                {loadingExams && <ActivityIndicator size="small" color={theme.primary} />}
              </View>

              <View style={styles.examGrid}>
                {exams.map((exam) => {
                  const isSelected = selectedExams.includes(exam.id);
                  const isPrimary = primaryExamId === exam.id;

                  return (
                    <TouchableOpacity
                      key={exam.id}
                      onPress={() => toggleExam(exam.id)}
                      style={[
                        styles.examChip,
                        {
                          backgroundColor: isSelected ? theme.primaryContainer : theme.surface,
                          borderColor: isSelected ? theme.primary : theme.border,
                          borderRadius: radii.md,
                          minHeight: touchTarget.minTouchSize,
                        },
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={`${exam.title} (${exam.body})`}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={styles.chipHeader}>
                          <Text style={[styles.chipBodyTag, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                            {exam.body}
                          </Text>
                          {isPrimary && (
                            <View style={[styles.primaryBadge, { backgroundColor: theme.primary }]}>
                              <Text style={[styles.primaryBadgeText, { color: theme.textInverse, fontSize: 10 }]}>
                                Primary
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.chipTitle, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                          {exam.title}
                        </Text>
                      </View>

                      {isSelected && (
                        <View style={[styles.checkCircle, { backgroundColor: theme.primary }]}>
                          <Check size={12} color={theme.textInverse} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Primary Exam Selector if multiple */}
            {selectedExams.length > 1 && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                  Choose Primary Exam Focus
                </Text>
                <View style={styles.primarySelectorRow}>
                  {selectedExams.map((examId) => {
                    const match = exams.find((e) => e.id === examId);
                    const isSelected = primaryExamId === examId;
                    return (
                      <TouchableOpacity
                        key={examId}
                        onPress={() => setPrimaryExamId(examId)}
                        style={[
                          styles.primaryExamButton,
                          {
                            backgroundColor: isSelected ? theme.primary : theme.surfaceVariant,
                            borderRadius: radii.sm,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.primaryExamButtonText,
                            {
                              color: isSelected ? theme.textInverse : theme.text,
                              fontSize: scaledFontSize('xs'),
                            },
                          ]}
                        >
                          {match?.title || examId}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Submit Details Button */}
            <TouchableOpacity
              onPress={handleRequestVerification}
              disabled={submitting}
              style={[
                styles.submitButton,
                {
                  backgroundColor: theme.primary,
                  borderRadius: radii.md,
                  minHeight: touchTarget.minTouchSize,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Proceed to email verification"
            >
              {submitting ? (
                <ActivityIndicator color={theme.textInverse} />
              ) : (
                <>
                  <Text style={[styles.submitButtonText, { color: theme.textInverse, fontSize: scaledFontSize('base') }]}>
                    Continue to Email Verification
                  </Text>
                  <ArrowRight size={18} color={theme.textInverse} style={{ marginLeft: 6 }} />
                </>
              )}
            </TouchableOpacity>

            {/* Link to Login */}
            <View style={styles.loginLinkRow}>
              <Text style={[styles.loginPromptText, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
                Already registered?
              </Text>
              <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
                <Text style={[styles.loginLink, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
                  Log in to account
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* Step 2: OTP Verification */
          <View style={styles.formCard}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                6-Digit Verification Code
              </Text>
              <View style={[styles.inputRow, { borderColor: theme.borderStrong, backgroundColor: theme.surface, borderRadius: radii.md }]}>
                <KeyRound size={20} color={theme.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      fontSize: scaledFontSize('2xl'),
                      letterSpacing: 8,
                      textAlign: 'center',
                    },
                  ]}
                  placeholder="••••••"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={setOtp}
                  autoFocus
                />
              </View>
            </View>

            {/* Verify Action Button */}
            <TouchableOpacity
              onPress={handleVerifyAndComplete}
              disabled={submitting || otp.length !== 6}
              style={[
                styles.submitButton,
                {
                  backgroundColor: otp.length === 6 ? theme.primary : theme.surfaceVariant,
                  borderRadius: radii.md,
                  minHeight: touchTarget.minTouchSize,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Verify code and complete registration"
            >
              {submitting ? (
                <ActivityIndicator color={theme.textInverse} />
              ) : (
                <Text
                  style={[
                    styles.submitButtonText,
                    {
                      color: otp.length === 6 ? theme.textInverse : theme.textMuted,
                      fontSize: scaledFontSize('base'),
                    },
                  ]}
                >
                  Verify and Create Account
                </Text>
              )}
            </TouchableOpacity>

            {/* Resend Cooldown and Controls */}
            <View style={styles.otpControlsRow}>
              {countdown > 0 ? (
                <Text style={[styles.cooldownText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  Resend code in {countdown}s
                </Text>
              ) : (
                <TouchableOpacity onPress={handleRequestVerification} disabled={submitting}>
                  <Text style={[styles.resendLink, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
                    Resend Verification Code
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={() => setStep('DETAILS')}>
                <Text style={[styles.resendLink, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
                  Change Email
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Security Disclosures */}
        <View style={styles.securityBox}>
          <ShieldCheck size={18} color={theme.primary} />
          <Text style={[styles.securityText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
            Protected by backend rate-limiting and session rotation. SidPrep never shares student credentials.
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
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backButtonText: {
    fontWeight: '600',
  },
  stepIndicator: {
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    lineHeight: 20,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  errorCardText: {
    flex: 1,
    fontWeight: '600',
  },
  formCard: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  countryCodeBadge: {
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    marginRight: 10,
  },
  countryCodeText: {
    fontWeight: '700',
  },
  input: {
    flex: 1,
    paddingVertical: 12,
  },
  singleNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  singleNameLabel: {
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  catalogueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  examGrid: {
    gap: 10,
  },
  examChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1.5,
  },
  chipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  chipBodyTag: {
    fontWeight: '800',
  },
  primaryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  primaryBadgeText: {
    fontWeight: '700',
  },
  chipTitle: {
    fontWeight: '700',
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primarySelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  primaryExamButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  primaryExamButtonText: {
    fontWeight: '700',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 8,
  },
  submitButtonText: {
    fontWeight: '700',
  },
  loginLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 8,
  },
  loginPromptText: {
    fontWeight: '500',
  },
  loginLink: {
    fontWeight: '700',
  },
  otpControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  cooldownText: {
    fontWeight: '600',
  },
  resendLink: {
    fontWeight: '700',
  },
  securityBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 24,
  },
  securityText: {
    flex: 1,
    lineHeight: 18,
  },
});
