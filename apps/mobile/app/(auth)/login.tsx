import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mail, KeyRound, ArrowRight, ShieldCheck } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();
  const { requestOtp, verifyOtp } = useAuth();

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleRequestOtp = async () => {
    if (!email || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid student email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await requestOtp(email.trim().toLowerCase(), phone.trim() || undefined);
      setIsOtpSent(true);
      setCountdown(60);
      Alert.alert('Verification Code Sent', res.message || 'Check your inbox for the 6-digit code.');
    } catch (err: any) {
      Alert.alert('Request Failed', err.message || 'Unable to send OTP at this time. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      await verifyOtp(email.trim().toLowerCase(), otp.trim());
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Verification Failed', err.message || 'The OTP code is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: theme.background, paddingTop: Math.max(insets.top, 24) }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Brand Header */}
        <View style={styles.header}>
          <Text style={[styles.brand, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
            SIDPREP STUDENT LOGIN
          </Text>
          <Text style={[styles.title, { color: theme.text, fontSize: scaledFontSize('3xl') }]}>
            {isOtpSent ? 'Enter 6-Digit Code' : 'Sign in to Your Account'}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted, fontSize: scaledFontSize('base') }]}>
            {isOtpSent
              ? `We sent a one-time verification code to ${email}.`
              : 'Enter your email to receive a secure one-time passcode.'}
          </Text>
        </View>

        {/* Input Form */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.lg }]}>
          {!isOtpSent ? (
            <>
              {/* Email Input */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                  Email Address (Required)
                </Text>
                <View style={[styles.inputRow, { borderColor: theme.borderStrong, backgroundColor: theme.surfaceVariant, borderRadius: radii.md }]}>
                  <Mail size={20} color={theme.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: theme.text, fontSize: scaledFontSize('base'), minHeight: touchTarget.minTouchSize }]}
                    placeholder="student@example.com"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>
              </View>

              {/* Optional Phone Input */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                  Phone Number (Optional)
                </Text>
                <View style={[styles.inputRow, { borderColor: theme.borderStrong, backgroundColor: theme.surfaceVariant, borderRadius: radii.md }]}>
                  <TextInput
                    style={[styles.input, { color: theme.text, fontSize: scaledFontSize('base'), minHeight: touchTarget.minTouchSize }]}
                    placeholder="+91 98765 43210"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleRequestOtp}
                disabled={loading}
                style={[
                  styles.primaryButton,
                  { minHeight: touchTarget.minTouchSize, backgroundColor: theme.primary, borderRadius: radii.md }
                ]}
                accessibilityRole="button"
                accessibilityLabel="Send OTP verification code"
              >
                {loading ? (
                  <ActivityIndicator color={theme.textInverse} />
                ) : (
                  <>
                    <Text style={[styles.primaryButtonText, { color: theme.textInverse, fontSize: scaledFontSize('base') }]}>
                      Send Verification Code
                    </Text>
                    <ArrowRight size={20} color={theme.textInverse} />
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* OTP Input */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                  Verification Code (OTP)
                </Text>
                <View style={[styles.inputRow, { borderColor: theme.borderStrong, backgroundColor: theme.surfaceVariant, borderRadius: radii.md }]}>
                  <KeyRound size={20} color={theme.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: theme.text, fontSize: scaledFontSize('2xl'), letterSpacing: 8, textAlign: 'center', minHeight: touchTarget.minTouchSize }]}
                    placeholder="123456"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={otp}
                    onChangeText={setOtp}
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleVerifyOtp}
                disabled={loading}
                style={[
                  styles.primaryButton,
                  { minHeight: touchTarget.minTouchSize, backgroundColor: theme.primary, borderRadius: radii.md }
                ]}
                accessibilityRole="button"
                accessibilityLabel="Verify code and continue"
              >
                {loading ? (
                  <ActivityIndicator color={theme.textInverse} />
                ) : (
                  <Text style={[styles.primaryButtonText, { color: theme.textInverse, fontSize: scaledFontSize('base') }]}>
                    Verify and Sign In
                  </Text>
                )}
              </TouchableOpacity>

              {/* Resend Action */}
              <View style={styles.resendRow}>
                {countdown > 0 ? (
                  <Text style={[styles.resendText, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
                    Resend code in {countdown}s
                  </Text>
                ) : (
                  <TouchableOpacity
                    onPress={handleRequestOtp}
                    style={{ minHeight: touchTarget.minTouchSize, justifyContent: 'center' }}
                  >
                    <Text style={[styles.resendLink, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
                      Resend Verification Code
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => setIsOtpSent(false)}
                  style={{ minHeight: touchTarget.minTouchSize, justifyContent: 'center' }}
                >
                  <Text style={[styles.resendLink, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
                    Edit Email
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Security Disclosures */}
        <View style={styles.securityBox}>
          <ShieldCheck size={18} color={theme.verified} />
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
    flex: 1
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40
  },
  header: {
    marginBottom: 24
  },
  brand: {
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6
  },
  title: {
    fontWeight: '800',
    lineHeight: 36,
    marginBottom: 8
  },
  subtitle: {
    lineHeight: 22
  },
  card: {
    padding: 20,
    borderWidth: 1,
    gap: 16
  },
  inputGroup: {
    gap: 8
  },
  label: {
    fontWeight: '600'
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12
  },
  inputIcon: {
    marginRight: 8
  },
  input: {
    flex: 1,
    fontWeight: '600'
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8
  },
  primaryButtonText: {
    fontWeight: '700'
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4
  },
  resendText: {
    fontWeight: '500'
  },
  resendLink: {
    fontWeight: '600'
  },
  securityBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    gap: 8,
    paddingHorizontal: 8
  },
  securityText: {
    flex: 1,
    lineHeight: 18
  }
});
