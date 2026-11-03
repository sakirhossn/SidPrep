import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, BookMarked, Play, CheckCircle2, ArrowRight, FolderKanban } from 'lucide-react-native';
import { HomeDashboardResponse } from '@sidprep/contracts';
import { api } from '../../src/api/client';
import { sqliteDb } from '../../src/services/sqliteDatabase';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { Header } from '../../src/components/Header';
import { ExamCountdownCard } from '../../src/components/ExamCountdownCard';

const CACHE_KEY_HOME = 'cache_home_dashboard';

export default function HomeScreen() {
  const router = useRouter();
  const { theme, scaledFontSize, radii, touchTarget, elevations } = useTheme();
  const { user } = useAuth();

  const [data, setData] = useState<HomeDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isCachedData, setIsCachedData] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const dashboard = await api.getHomeDashboard();
      setData(dashboard);
      setIsCachedData(false);
      await sqliteDb.setCache(CACHE_KEY_HOME, dashboard);
    } catch {
      // Offline fallback: load from SQLite cache
      const cached = await sqliteDb.getCache<HomeDashboardResponse>(CACHE_KEY_HOME);
      if (cached) {
        setData(cached);
        setIsCachedData(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && !data) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const primaryExam = data?.primaryExam;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Header
        title="SidPrep"
        subtitle={isCachedData ? 'Showing offline cached data' : 'Government Exam Prep'}
        rightAction={
          <TouchableOpacity
            onPress={() => router.push('/notifications')}
            style={[styles.bellBtn, { minWidth: touchTarget.minTouchSize, minHeight: touchTarget.minTouchSize }]}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Bell size={22} color={theme.text} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
      >
        {/* Exam Countdown & Progress Card */}
        {primaryExam && (
          <ExamCountdownCard
            exam={primaryExam}
            streakDays={data?.dailyGoal.streakDays ?? 0}
            dailyTargetMinutes={data?.dailyGoal.targetMinutes ?? 60}
            completedMinutes={data?.dailyGoal.completedMinutes ?? 0}
            accuracyRate={data?.dailyGoal.accuracyRate ?? 0}
            onPressExamHub={() => router.push(`/exam/${primaryExam.id}`)}
          />
        )}

        {/* Resume Attempt Card (if any in progress) */}
        {data?.activeAttempt && (
          <TouchableOpacity
            onPress={() => router.push(`/mock/${data.activeAttempt!.testId}/runner`)}
            style={[
              styles.resumeCard,
              {
                backgroundColor: theme.warningBg,
                borderColor: theme.warningBorder,
                borderRadius: radii.lg
              }
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Resume active mock attempt: ${data.activeAttempt.testTitle}`}
          >
            <View style={styles.resumeIconBox}>
              <Play size={20} color={theme.warning} />
            </View>
            <View style={styles.resumeContent}>
              <Text style={[styles.resumeHeading, { color: theme.warning, fontSize: scaledFontSize('xs') }]}>
                TEST IN PROGRESS
              </Text>
              <Text style={[styles.resumeTitle, { color: theme.text, fontSize: scaledFontSize('base') }]} numberOfLines={1}>
                {data.activeAttempt.testTitle}
              </Text>
              <Text style={[styles.resumeTime, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Remaining: {Math.floor(data.activeAttempt.remainingSeconds / 60)} mins
              </Text>
            </View>
            <ArrowRight size={20} color={theme.warning} />
          </TouchableOpacity>
        )}

        {/* Quick Navigation Rows: Study Plan & Resource Library */}
        <View style={styles.actionGrid}>
          <TouchableOpacity
            onPress={() => router.push('/study-plan')}
            style={[
              styles.actionCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                borderRadius: radii.md,
                ...elevations.subtle
              }
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open today's study plan"
          >
            <View style={[styles.actionIconBox, { backgroundColor: theme.primaryContainer }]}>
              <CheckCircle2 size={20} color={theme.primary} />
            </View>
            <Text style={[styles.actionTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
              Study Plan
            </Text>
            <Text style={[styles.actionSub, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              {data?.todayTasksSummary.completedTasks}/{data?.todayTasksSummary.totalTasks} Tasks Done
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/resources')}
            style={[
              styles.actionCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                borderRadius: radii.md,
                ...elevations.subtle
              }
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open educational resource library"
          >
            <View style={[styles.actionIconBox, { backgroundColor: theme.successBg }]}>
              <BookMarked size={20} color={theme.success} />
            </View>
            <Text style={[styles.actionTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
              Resources
            </Text>
            <Text style={[styles.actionSub, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              Formulas & Notes
            </Text>
          </TouchableOpacity>
        </View>

        {/* Recommended Mocks Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text, fontSize: scaledFontSize('lg') }]}>
              Recommended Practice
            </Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/mocks')}>
              <Text style={[styles.seeAllText, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
                View All
              </Text>
            </TouchableOpacity>
          </View>

          {data?.recommendedTests.map((t) => (
            <TouchableOpacity
              key={t.id}
              onPress={() => router.push(`/mock/${t.id}`)}
              style={[
                styles.testCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  borderRadius: radii.md,
                  minHeight: touchTarget.minTouchSize
                }
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Start test: ${t.title}`}
            >
              <View style={styles.testCardHeader}>
                <View style={[styles.typeBadge, { backgroundColor: theme.surfaceVariant }]}>
                  <Text style={[styles.typeText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                    {t.type.replace(/_/g, ' ')}
                  </Text>
                </View>
                <Text style={[styles.testMetrics, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  {t.durationMinutes} mins • {t.questionsCount} Qs
                </Text>
              </View>

              <Text style={[styles.testTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                {t.title}
              </Text>

              <View style={styles.testFooter}>
                <Text style={[styles.testExamTag, { color: theme.textSubtle, fontSize: scaledFontSize('xs') }]}>
                  {t.examTitle}
                </Text>
                <View style={styles.startRow}>
                  <Text style={[styles.startText, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
                    Start Test
                  </Text>
                  <ArrowRight size={16} color={theme.primary} />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
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
  bellBtn: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  scrollContent: {
    paddingBottom: 32
  },
  resumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    borderWidth: 1.5,
    gap: 12
  },
  resumeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center'
  },
  resumeContent: {
    flex: 1
  },
  resumeHeading: {
    fontWeight: '800',
    letterSpacing: 1
  },
  resumeTitle: {
    fontWeight: '700',
    marginTop: 2
  },
  resumeTime: {
    marginTop: 2
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 16
  },
  actionCard: {
    flex: 1,
    padding: 14,
    borderWidth: 1
  },
  actionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8
  },
  actionTitle: {
    fontWeight: '700'
  },
  actionSub: {
    marginTop: 4
  },
  section: {
    marginHorizontal: 16,
    marginTop: 12
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionTitle: {
    fontWeight: '800'
  },
  seeAllText: {
    fontWeight: '600'
  },
  testCard: {
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
    gap: 8
  },
  testCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  typeText: {
    fontWeight: '700'
  },
  testMetrics: {
    fontWeight: '500'
  },
  testTitle: {
    fontWeight: '700',
    lineHeight: 22
  },
  testFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9'
  },
  testExamTag: {
    fontWeight: '500'
  },
  startRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  startText: {
    fontWeight: '700'
  }
});
