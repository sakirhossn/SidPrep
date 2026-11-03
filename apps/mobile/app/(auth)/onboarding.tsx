import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ShieldCheck, ArrowRight } from 'lucide-react-native';
import { ExamSummary, SupportedLanguage } from '@sidprep/contracts';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();
  const { updatePreferences } = useAuth();

  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [selectedExams, setSelectedExams] = useState<string[]>(['ssc-cgl']);
  const [primaryExam, setPrimaryExam] = useState<string>('ssc-cgl');
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>('en');
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<number>(60);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await api.getExams();
        if (mounted) setExams(list);
      } catch {
        // Fallback default exams if offline
        if (mounted) {
          setExams([
            { id: 'ssc-cgl', body: 'SSC', code: 'SSC_CGL', title: 'SSC CGL 2026', description: 'Combined Graduate Level', currentStatus: 'EXAM_SCHEDULED', isDateAnnounced: true, stagesCount: 2, availableTestsCount: 24 },
            { id: 'rrb-ntpc', body: 'RRB', code: 'RRB_NTPC', title: 'RRB NTPC', description: 'Non-Technical Categories', currentStatus: 'DATE_NOT_ANNOUNCED', isDateAnnounced: false, stagesCount: 2, availableTestsCount: 18 },
            { id: 'wbpsc-clerkship', body: 'WBPSC', code: 'WBPSC_CLERKSHIP', title: 'WBPSC Clerkship', description: 'West Bengal Public Service', currentStatus: 'EXAM_SCHEDULED', isDateAnnounced: true, stagesCount: 2, availableTestsCount: 12 },
            { id: 'ibps-po', body: 'IBPS', code: 'IBPS_PO', title: 'IBPS Probationary Officer', description: 'National Banking Recruitment', currentStatus: 'DATE_NOT_ANNOUNCED', isDateAnnounced: false, stagesCount: 3, availableTestsCount: 15 }
          ]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const toggleExam = (id: string) => {
    if (selectedExams.includes(id)) {
      if (selectedExams.length > 1) {
        const filtered = selectedExams.filter(e => e !== id);
        setSelectedExams(filtered);
        if (primaryExam === id) setPrimaryExam(filtered[0]!);
      }
    } else {
      setSelectedExams([...selectedExams, id]);
    }
  };

  const handleContinue = async () => {
    try {
      await updatePreferences({
        selectedExamIds: selectedExams,
        primaryExamId: primaryExam,
        preferredLanguage: selectedLanguage,
        dailyTargetMinutes: dailyGoalMinutes
      });
    } catch {
      // Local fallback
    }
    router.replace('/(auth)/login');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: Math.max(insets.top, 16) }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Welcome Header */}
        <View style={styles.header}>
          <Text style={[styles.brandBadge, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
            SIDPREP 2.0
          </Text>
          <Text style={[styles.title, { color: theme.text, fontSize: scaledFontSize('3xl') }]}>
            Target Your Competitive Exam
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted, fontSize: scaledFontSize('base') }]}>
            High-yield practice, verified syllabus patterns, and authoritative tests for SSC, RRB, WBPSC, and IBPS.
          </Text>
        </View>

        {/* Section 1: Choose Target Exams */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text, fontSize: scaledFontSize('lg') }]}>
            1. Select Your Target Exams
          </Text>
          <Text style={[styles.sectionSubtitle, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
            Choose one or more. Official syllabus and mocks will personalize to your targets.
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
                        minHeight: touchTarget.minTouchSize
                      }
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

        {/* Section 2: Preferred Language */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text, fontSize: scaledFontSize('lg') }]}>
            2. Preferred Language
          </Text>
          <View style={styles.optionRow}>
            {[
              { id: 'en', label: 'English' },
              { id: 'hi', label: 'हिंदी (Hindi)' },
              { id: 'bn', label: 'বাংলা (Bengali)' }
            ].map((lang) => {
              const isSelected = selectedLanguage === lang.id;
              return (
                <TouchableOpacity
                  key={lang.id}
                  onPress={() => setSelectedLanguage(lang.id as SupportedLanguage)}
                  style={[
                    styles.langChip,
                    {
                      minHeight: touchTarget.minTouchSize,
                      backgroundColor: isSelected ? theme.primary : theme.surface,
                      borderColor: isSelected ? theme.primary : theme.border,
                      borderRadius: radii.md
                    }
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                >
                  <Text style={[styles.langChipText, { color: isSelected ? theme.textInverse : theme.text, fontSize: scaledFontSize('sm') }]}>
                    {lang.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Section 3: Daily Study Goal */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text, fontSize: scaledFontSize('lg') }]}>
            3. Daily Study Target
          </Text>
          <View style={styles.optionRow}>
            {[
              { minutes: 30, label: '30 mins' },
              { minutes: 60, label: '60 mins' },
              { minutes: 90, label: '90 mins' },
              { minutes: 120, label: '2 hours' }
            ].map((goal) => {
              const isSelected = dailyGoalMinutes === goal.minutes;
              return (
                <TouchableOpacity
                  key={goal.minutes}
                  onPress={() => setDailyGoalMinutes(goal.minutes)}
                  style={[
                    styles.langChip,
                    {
                      minHeight: touchTarget.minTouchSize,
                      backgroundColor: isSelected ? theme.primary : theme.surface,
                      borderColor: isSelected ? theme.primary : theme.border,
                      borderRadius: radii.md
                    }
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                >
                  <Text style={[styles.langChipText, { color: isSelected ? theme.textInverse : theme.text, fontSize: scaledFontSize('sm') }]}>
                    {goal.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Proceed CTA */}
        <View style={styles.ctaBox}>
          <TouchableOpacity
            onPress={handleContinue}
            style={[
              styles.continueBtn,
              {
                minHeight: touchTarget.minTouchSize,
                backgroundColor: theme.primary,
                borderRadius: radii.md
              }
            ]}
            accessibilityRole="button"
            accessibilityLabel="Continue to account setup"
          >
            <Text style={[styles.continueBtnText, { color: theme.textInverse, fontSize: scaledFontSize('base') }]}>
              Continue to Login
            </Text>
            <ArrowRight size={20} color={theme.textInverse} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
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
    marginBottom: 28
  },
  brandBadge: {
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8
  },
  title: {
    fontWeight: '800',
    lineHeight: 36,
    marginBottom: 10
  },
  subtitle: {
    lineHeight: 22
  },
  section: {
    marginBottom: 24
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 4
  },
  sectionSubtitle: {
    marginBottom: 14
  },
  examGrid: {
    gap: 12
  },
  examCard: {
    padding: 16,
    borderWidth: 1.5,
    gap: 6
  },
  examCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  examBodyTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6
  },
  examBodyTagText: {
    fontWeight: '700'
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center'
  },
  examCardTitle: {
    fontWeight: '700',
    marginTop: 2
  },
  examCardStatus: {
    fontWeight: '500'
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10
  },
  langChip: {
    flex: 1,
    minWidth: 90,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    paddingHorizontal: 12
  },
  langChipText: {
    fontWeight: '600'
  },
  ctaBox: {
    marginTop: 16
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20
  },
  continueBtnText: {
    fontWeight: '700'
  }
});
