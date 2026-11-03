import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle2, Circle, Flame, Target, ArrowRight, AlertTriangle } from 'lucide-react-native';
import { DailyStudyPlanResponse, StudyTask } from '@sidprep/contracts';
import { api } from '../src/api/client';
import { sqliteDb } from '../src/services/sqliteDatabase';
import { useTheme } from '../src/context/ThemeContext';
import { Header } from '../src/components/Header';

const CACHE_KEY_PLAN = 'cache_study_plan';

export default function StudyPlanScreen() {
  const router = useRouter();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();

  const [plan, setPlan] = useState<DailyStudyPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPlan = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const res = await api.getStudyPlan();
      setPlan(res);
      await sqliteDb.setCache(CACHE_KEY_PLAN, res);
    } catch {
      const cached = await sqliteDb.getCache<DailyStudyPlanResponse>(CACHE_KEY_PLAN);
      if (cached) setPlan(cached);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const toggleTask = (taskId: string) => {
    if (!plan) return;
    const updatedTasks = plan.tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, isCompleted: !t.isCompleted };
      }
      return t;
    });
    const completedMins = updatedTasks
      .filter(t => t.isCompleted)
      .reduce((sum, t) => sum + t.estimatedMinutes, 0);

    const updatedPlan: DailyStudyPlanResponse = {
      ...plan,
      completedMinutes: completedMins,
      tasks: updatedTasks
    };
    setPlan(updatedPlan);
    sqliteDb.setCache(CACHE_KEY_PLAN, updatedPlan);
  };

  if (loading || !plan) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const completedCount = plan.tasks.filter(t => t.isCompleted).length;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Header title="Daily Study Plan" subtitle="Server-configured goal & revision targets" showBack={true} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPlan(true)} />}
      >
        {/* Streak & Goal Header Card */}
        <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.lg }]}>
          <View style={styles.metricRow}>
            <View style={styles.metricItem}>
              <View style={styles.labelWithIcon}>
                <Flame size={16} color={theme.warning} />
                <Text style={[styles.metricLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  Consistency
                </Text>
              </View>
              <Text style={[styles.metricVal, { color: theme.text, fontSize: scaledFontSize('xl') }]}>
                {plan.dayStreak} Days
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <View style={styles.metricItem}>
              <View style={styles.labelWithIcon}>
                <Target size={16} color={theme.primary} />
                <Text style={[styles.metricLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  Daily Minutes
                </Text>
              </View>
              <Text style={[styles.metricVal, { color: theme.text, fontSize: scaledFontSize('xl') }]}>
                {plan.completedMinutes} / {plan.targetMinutes}
              </Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={[styles.progressBarBg, { backgroundColor: theme.surfaceVariant }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  backgroundColor: theme.primary,
                  width: `${Math.min(100, Math.round((plan.completedMinutes / plan.targetMinutes) * 100))}%`
                }
              ]}
            />
          </View>
          <Text style={[styles.progressNote, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
            {completedCount} of {plan.tasks.length} tasks completed today
          </Text>
        </View>

        {/* Tasks Checklist */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text, fontSize: scaledFontSize('lg') }]}>
            Today's Assigned Tasks
          </Text>

          {plan.tasks.map((task: StudyTask) => (
            <View
              key={task.id}
              style={[
                styles.taskCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: task.isCompleted ? theme.successBorder : theme.border,
                  borderRadius: radii.md
                }
              ]}
            >
              <TouchableOpacity
                onPress={() => toggleTask(task.id)}
                style={[styles.checkboxTouch, { minWidth: touchTarget.minTouchSize, minHeight: touchTarget.minTouchSize }]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: task.isCompleted }}
                accessibilityLabel={task.title}
              >
                {task.isCompleted ? (
                  <CheckCircle2 size={24} color={theme.success} />
                ) : (
                  <Circle size={24} color={theme.textMuted} />
                )}
              </TouchableOpacity>

              <View style={styles.taskContent}>
                <View style={styles.taskTopRow}>
                  <View style={[styles.typeBadge, { backgroundColor: theme.surfaceVariant }]}>
                    <Text style={[styles.typeText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                      {task.type.replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <Text style={[styles.taskMins, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                    ~{task.estimatedMinutes} mins
                  </Text>
                </View>

                <Text
                  style={[
                    styles.taskTitle,
                    {
                      color: task.isCompleted ? theme.textMuted : theme.text,
                      textDecorationLine: task.isCompleted ? 'line-through' : 'none',
                      fontSize: scaledFontSize('base')
                    }
                  ]}
                >
                  {task.title}
                </Text>

                {task.description ? (
                  <Text style={[styles.taskDesc, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                    {task.description}
                  </Text>
                ) : null}

                {task.actionRoute && !task.isCompleted && (
                  <TouchableOpacity
                    onPress={() => router.push(task.actionRoute as any)}
                    style={styles.actionLinkRow}
                  >
                    <Text style={[styles.actionLinkText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                      Open Material / Start
                    </Text>
                    <ArrowRight size={14} color={theme.primary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Weak Topic Recommendations */}
        {plan.weakTopicRecommendations.length > 0 && (
          <View style={[styles.weakCard, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, borderRadius: radii.lg }]}>
            <View style={styles.weakHeader}>
              <AlertTriangle size={18} color={theme.warning} />
              <Text style={[styles.weakTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                Algorithm Recommended Revision
              </Text>
            </View>

            {plan.weakTopicRecommendations.map((rec, idx) => (
              <View key={idx} style={styles.recItem}>
                <Text style={[styles.recTopic, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                  {rec.topicName}
                </Text>
                <Text style={[styles.recReason, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  {rec.reason} • {rec.suggestedAction}
                </Text>
              </View>
            ))}
          </View>
        )}
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
  summaryCard: {
    padding: 16,
    borderWidth: 1,
    gap: 12
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center'
  },
  metricItem: {
    alignItems: 'center',
    gap: 4
  },
  labelWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  metricLabel: {
    fontWeight: '500'
  },
  metricVal: {
    fontWeight: '800'
  },
  divider: {
    width: 1,
    height: 36
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4
  },
  progressNote: {
    textAlign: 'center',
    fontWeight: '500'
  },
  section: {
    gap: 12
  },
  sectionTitle: {
    fontWeight: '800'
  },
  taskCard: {
    flexDirection: 'row',
    padding: 14,
    borderWidth: 1,
    gap: 10
  },
  checkboxTouch: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  taskContent: {
    flex: 1,
    gap: 4
  },
  taskTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6
  },
  typeText: {
    fontWeight: '700'
  },
  taskMins: {
    fontWeight: '500'
  },
  taskTitle: {
    fontWeight: '700',
    lineHeight: 20
  },
  taskDesc: {
    lineHeight: 18
  },
  actionLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6
  },
  actionLinkText: {
    fontWeight: '700'
  },
  weakCard: {
    padding: 16,
    borderWidth: 1,
    gap: 12
  },
  weakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  weakTitle: {
    fontWeight: '700'
  },
  recItem: {
    gap: 2
  },
  recTopic: {
    fontWeight: '700'
  },
  recReason: {
    lineHeight: 16
  }
});
