import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ShieldCheck, ArrowRight, User, AlertCircle } from 'lucide-react-native';
import { ExamSummary, SupportedLanguage } from '@sidprep/contracts';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();
  const { user, isAuthenticated, isLoading, updatePreferences } = useAuth();

  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [selectedExams, setSelectedExams] = useState<string[]>([]);
  const [primaryExam, setPrimaryExam] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>('en');
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<number>(60);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Profile completion fields if missing
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [isSingleName, setIsSingleName] = useState(Boolean(user?.isSingleName));
  const [phone, setPhone] = useState(user?.phone || '');

  // Protect route: onboarding requires valid authentication
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/(auth)/account-options');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await api.getExams();
        if (mounted) {
          const activeList = Array.isArray(list)
            ? list.filter((e: any) => e.status !== 'INACTIVE')
            : [];
          setExams(activeList);

          // Initialize selections with existing user preferences or default to first active exam
          const existingExams = user?.selectedExamIds || (user as any)?.targetExams || [];
          if (existingExams.length > 0) {
            setSelectedExams(existingExams);
            setPrimaryExam(user?.primaryExamId || existingExams[0]);
          } else if (activeList.length > 0) {
            setSelectedExams([activeList[0]!.id]);
            setPrimaryExam(activeList[0]!.id);
          }

          if (user?.preferredLanguage) {
            setSelectedLanguage(user.preferredLanguage);
          }
          if (user?.firstName) setFirstName(user.firstName);
          if (user?.lastName) setLastName(user.lastName);
          if (typeof user?.isSingleName === 'boolean') setIsSingleName(user.isSingleName);
          if (user?.phone) setPhone(user.phone);
        }
      } catch (err) {
        console.warn('Failed to load exams catalogue:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  const toggleExam = (id: string) => {
    if (selectedExams.includes(id)) {
      if (selectedExams.length > 1) {
        const filtered = selectedExams.filter((e) => e !== id);
        setSelectedExams(filtered);
        if (primaryExam === id) setPrimaryExam(filtered[0]!);
      } else {
        Alert.alert('Selection Required', 'At least one target exam must remain selected.');
      }
    } else {
      const updated = [...selectedExams, id];
      setSelectedExams(updated);
      if (!primaryExam) setPrimaryExam(id);
    }
  };

  const handleSaveAndContinue = async () => {
    setErrorMsg(null);

    // Validate mandatory profile fields
    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) {
      setErrorMsg('Please enter your first name.');
      Alert.alert('Incomplete Profile', 'Please enter your first name.');
      return;
    }
    if (!isSingleName && !lastName.trim()) {
      setErrorMsg('Please enter your last name or select the single legal name option.');
      Alert.alert('Incomplete Profile', 'Please enter your last name or select single legal name.');
      return;
    }
    const cleanPhone = phone.replace(/[\s-]/g, '').trim();
    if (!cleanPhone || cleanPhone.length < 5) {
      setErrorMsg('Please enter a valid mobile number.');
      Alert.alert('Incomplete Profile', 'Please enter a valid mobile number.');
      return;
    }
    if (selectedExams.length === 0) {
      setErrorMsg('Please select at least one preparation exam.');
      Alert.alert('Incomplete Profile', 'Please select at least one target exam.');
      return;
    }

    setSaving(true);
    try {
      // Durable save to authenticated /me endpoint
      await updatePreferences({
        selectedExamIds: selectedExams,
        primaryExamId: primaryExam || selectedExams[0],
        preferredLanguage: selectedLanguage,
        dailyTargetMinutes: dailyGoalMinutes,
      });

      // Update full profile attributes
      await api.updateMe({
        firstName: trimmedFirst,
        lastName: isSingleName ? '' : lastName.trim(),
        isSingleName,
        phone: cleanPhone,
        targetExams: selectedExams,
        primaryExamId: primaryExam || selectedExams[0],
        preferredLanguage: selectedLanguage,
        dailyGoalMinutes,
      });

      // Successfully saved: proceed to dashboard
      router.replace('/(tabs)');
    } catch (err: any) {
      const msg = err.message || 'Failed to save preparation profile. Please retry.';
      setErrorMsg(msg);
      Alert.alert('Save Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: Math.max(insets.top, 16) }]}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 36) }]}>
        {/* Welcome Header */}
        <View style={styles.header}>
          <Text style={[styles.brandBadge, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
            SIDPREP ONBOARDING
          </Text>
          <Text style={[styles.title, { color: theme.text, fontSize: scaledFontSize('2xl') }]}>
            Complete Preparation Profile
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
            Configure your target exams, primary exam focus, and daily target to personalize your mock test series.
          </Text>
        </View>

        {/* Error Alert Box */}
        {errorMsg && (
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
              {errorMsg}
            </Text>
          </View>
        )}

        {/* Section 1: Candidate Identity Details */}
        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.md }]}>
          <Text style={[styles.sectionTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
            Candidate Information
          </Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.fieldLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              First Name
            </Text>
            <View style={[styles.inputRow, { borderColor: theme.borderStrong, backgroundColor: theme.surfaceVariant, borderRadius: radii.sm }]}>
              <User size={18} color={theme.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.input, { color: theme.text, fontSize: scaledFontSize('sm') }]}
                placeholder="First name"
                placeholderTextColor={theme.textMuted}
                value={firstName}
                onChangeText={setFirstName}
              />
            </View>
          </View>

          <View style={styles.singleNameRow}>
            <Text style={[styles.singleNameLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              I have only one legal name
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

          {!isSingleName && (
            <View style={styles.inputGroup}>
              <Text style={[styles.fieldLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Last Name
              </Text>
              <View style={[styles.inputRow, { borderColor: theme.borderStrong, backgroundColor: theme.surfaceVariant, borderRadius: radii.sm }]}>
                <TextInput
                  style={[styles.input, { color: theme.text, fontSize: scaledFontSize('sm') }]}
                  placeholder="Last name"
                  placeholderTextColor={theme.textMuted}
                  value={lastName}
                  onChangeText={setLastName}
                />
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={[styles.fieldLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              Mobile Number
            </Text>
            <View style={[styles.inputRow, { borderColor: theme.borderStrong, backgroundColor: theme.surfaceVariant, borderRadius: radii.sm }]}>
              <TextInput
                style={[styles.input, { color: theme.text, fontSize: scaledFontSize('sm') }]}
                placeholder="Mobile number"
                placeholderTextColor={theme.textMuted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>
          </View>
        </View>

        {/* Section 2: Choose Target Exams */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
            Target Exams (Database Catalogue)
          </Text>
          <Text style={[styles.sectionSubtitle, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
            Choose one or more. Mocks and syllabus patterns are drawn from the database catalogue.
          </Text>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 20 }} color={theme.primary} />
          ) : (
            <View style={styles.examGrid}>
              {exams.map((exam) => {
                const isSelected = selectedExams.includes(exam.id);
                return (
                  <TouchableOpacity
                    key={exam.id}
                    onPress={() => toggleExam(exam.id)}
                    style={[
                      styles.examCard,
                      {
                        backgroundColor: isSelected ? theme.primaryContainer : theme.surface,
                        borderColor: isSelected ? theme.primary : theme.border,
                        borderRadius: radii.md,
                        minHeight: touchTarget.minTouchSize,
                      },
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={exam.title}
                  >
                    <View style={styles.examCardHeader}>
                      <View style={[styles.examBodyTag, { backgroundColor: isSelected ? theme.primary : theme.surfaceVariant }]}>
                        <Text style={[styles.examBodyTagText, { color: isSelected ? theme.textInverse : theme.primary, fontSize: scaledFontSize('xs') }]}>
                          {exam.body}
                        </Text>
                      </View>
                      {isSelected && (
                        <View style={[styles.checkCircle, { backgroundColor: theme.primary }]}>
                          <Check size={14} color={theme.textInverse} />
                        </View>
                      )}
                    </View>

                    <Text style={[styles.examCardTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                      {exam.title}
                    </Text>

                    <Text style={[styles.examCardStatus, { color: exam.isDateAnnounced ? theme.primary : theme.textSubtle, fontSize: scaledFontSize('xs') }]}>
                      {exam.isDateAnnounced ? 'Official Date Announced' : 'Date Not Announced'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Section 3: Preferred Language */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
            Preferred Question Language
          </Text>
          <View style={styles.languageRow}>
            {(['en', 'hi', 'bn'] as SupportedLanguage[]).map((lang) => {
              const isSelected = selectedLanguage === lang;
              const labels: Record<string, string> = { en: 'English', hi: 'Hindi', bn: 'Bengali' };
              return (
                <TouchableOpacity
                  key={lang}
                  onPress={() => setSelectedLanguage(lang)}
                  style={[
                    styles.langButton,
                    {
                      backgroundColor: isSelected ? theme.primary : theme.surface,
                      borderColor: isSelected ? theme.primary : theme.border,
                      borderRadius: radii.md,
                      minHeight: touchTarget.minTouchSize,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${labels[lang]}`}
                >
                  <Text style={[styles.langText, { color: isSelected ? theme.textInverse : theme.text, fontSize: scaledFontSize('sm') }]}>
                    {labels[lang]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Section 4: Daily Target Minutes */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
            Daily Study Goal
          </Text>
          <View style={styles.languageRow}>
            {[30, 45, 60, 90].map((mins) => {
              const isSelected = dailyGoalMinutes === mins;
              return (
                <TouchableOpacity
                  key={mins}
                  onPress={() => setDailyGoalMinutes(mins)}
                  style={[
                    styles.langButton,
                    {
                      backgroundColor: isSelected ? theme.primary : theme.surface,
                      borderColor: isSelected ? theme.primary : theme.border,
                      borderRadius: radii.md,
                      minHeight: touchTarget.minTouchSize,
                    },
                  ]}
                >
                  <Text style={[styles.langText, { color: isSelected ? theme.textInverse : theme.text, fontSize: scaledFontSize('sm') }]}>
                    {mins} mins
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Action Button */}
        <TouchableOpacity
          onPress={handleSaveAndContinue}
          disabled={saving}
          style={[
            styles.continueButton,
            {
              backgroundColor: theme.primary,
              borderRadius: radii.md,
              minHeight: touchTarget.minTouchSize,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Save profile and enter dashboard"
        >
          {saving ? (
            <ActivityIndicator color={theme.textInverse} />
          ) : (
            <>
              <Text style={[styles.continueButtonText, { color: theme.textInverse, fontSize: scaledFontSize('base') }]}>
                Save Preferences & Enter Dashboard
              </Text>
              <ArrowRight size={20} color={theme.textInverse} style={{ marginLeft: 8 }} />
            </>
          )}
        </TouchableOpacity>

        {/* Security Disclosures */}
        <View style={styles.securityBox}>
          <ShieldCheck size={18} color={theme.verified} />
          <Text style={[styles.securityText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
            Preferences are saved directly to your authenticated candidate profile.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  brandBadge: {
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
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
  sectionCard: {
    padding: 16,
    borderWidth: 1,
    marginBottom: 20,
    gap: 12,
  },
  fieldLabel: {
    fontWeight: '700',
    marginBottom: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 8,
  },
  singleNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  singleNameLabel: {
    fontWeight: '600',
  },
  inputGroup: {
    gap: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionSubtitle: {
    lineHeight: 18,
    marginBottom: 12,
  },
  examGrid: {
    gap: 10,
  },
  examCard: {
    padding: 14,
    borderWidth: 1.5,
  },
  examCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  examBodyTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  examBodyTagText: {
    fontWeight: '700',
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  examCardTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  examCardStatus: {
    fontWeight: '500',
  },
  languageRow: {
    flexDirection: 'row',
    gap: 10,
  },
  langButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingVertical: 10,
  },
  langText: {
    fontWeight: '600',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 10,
  },
  continueButtonText: {
    fontWeight: '700',
  },
  securityBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
  },
  securityText: {
    flex: 1,
    lineHeight: 18,
  },
});
