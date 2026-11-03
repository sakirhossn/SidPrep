import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Clock, HelpCircle, Award, AlertCircle, Play, ShieldCheck } from 'lucide-react-native';
import { TestItem } from '@sidprep/contracts';
import { api } from '../../../src/api/client';
import { useTheme } from '../../../src/context/ThemeContext';
import { Header } from '../../../src/components/Header';

export default function MockOverviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();

  const [test, setTest] = useState<TestItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.getTests();
        const found = res.items.find(t => t.id === id);
        if (mounted) setTest(found ?? res.items[0] ?? null);
      } catch (e) {
        console.warn('Error loading test overview:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  if (loading || !test) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const handleStart = () => {
    router.replace(`/mock/${test.id}/runner`);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Header title={test.title} subtitle={test.examTitle} showBack={true} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Test Overview Card */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.lg }]}>
          <Text style={[styles.title, { color: theme.text, fontSize: scaledFontSize('xl') }]}>
            {test.title}
          </Text>

          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Clock size={16} color={theme.primary} />
              <Text style={[styles.metricLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Duration
              </Text>
              <Text style={[styles.metricVal, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                {test.durationMinutes} mins
              </Text>
            </View>

            <View style={styles.metricItem}>
              <HelpCircle size={16} color={theme.primary} />
              <Text style={[styles.metricLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Questions
              </Text>
              <Text style={[styles.metricVal, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                {test.totalQuestions} Qs
              </Text>
            </View>

            <View style={styles.metricItem}>
              <Award size={16} color={theme.primary} />
              <Text style={[styles.metricLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Total Marks
              </Text>
              <Text style={[styles.metricVal, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                {test.totalMarks}
              </Text>
            </View>
          </View>
        </View>

        {/* Instructions & Official Rules */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.lg }]}>
          <Text style={[styles.sectionHeading, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
            EXAM INSTRUCTIONS & RULES
          </Text>

          <View style={styles.ruleItem}>
            <ShieldCheck size={18} color={theme.verified} />
            <Text style={[styles.ruleText, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
              Server-authoritative timer runs continuously once test begins.
            </Text>
          </View>

          <View style={styles.ruleItem}>
            <AlertCircle size={18} color={theme.warning} />
            <Text style={[styles.ruleText, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
              Negative marking applies strictly per official pattern: -0.5 marks for wrong answers.
            </Text>
          </View>

          <View style={styles.ruleItem}>
            <ShieldCheck size={18} color={theme.verified} />
            <Text style={[styles.ruleText, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
              Offline protection: Every answer is saved locally in SQLite and synced automatically when reconnected.
            </Text>
          </View>

          <View style={styles.ruleItem}>
            <ShieldCheck size={18} color={theme.verified} />
            <Text style={[styles.ruleText, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
              Detailed solutions and rank percentiles will be available immediately after verified submission.
            </Text>
          </View>
        </View>

        {/* Start Test CTA */}
        <TouchableOpacity
          onPress={handleStart}
          style={[
            styles.startBtn,
            {
              minHeight: touchTarget.minTouchSize,
              backgroundColor: theme.primary,
              borderRadius: radii.md
            }
          ]}
          accessibilityRole="button"
          accessibilityLabel="Start mock test now"
        >
          <Play size={20} color={theme.textInverse} fill={theme.textInverse} />
          <Text style={[styles.startBtnText, { color: theme.textInverse, fontSize: scaledFontSize('base') }]}>
            Start Mock Test
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16
  },
  card: {
    padding: 16,
    borderWidth: 1,
    gap: 12
  },
  title: {
    fontWeight: '800',
    lineHeight: 28
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9'
  },
  metricItem: {
    alignItems: 'center',
    gap: 4
  },
  metricLabel: {
    fontWeight: '500'
  },
  metricVal: {
    fontWeight: '700'
  },
  sectionHeading: {
    fontWeight: '800',
    letterSpacing: 1
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  ruleText: {
    flex: 1,
    lineHeight: 20
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8
  },
  startBtnText: {
    fontWeight: '700'
  }
});
