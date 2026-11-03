import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Award, CheckCircle2, XCircle, Clock, Target, AlertTriangle, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react-native';
import { AttemptResult, QuestionSolution } from '@sidprep/contracts';
import { sqliteDb } from '../../../src/services/sqliteDatabase';
import { useTheme } from '../../../src/context/ThemeContext';
import { Header } from '../../../src/components/Header';

export default function MockResultScreen() {
  const { id, attemptId } = useLocalSearchParams<{ id: string; attemptId: string }>();
  const router = useRouter();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();

  const [result, setResult] = useState<AttemptResult | null>(null);
  const [expandedSolutions, setExpandedSolutions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cached = await sqliteDb.getCache<AttemptResult>(`result_${attemptId}`);
        if (mounted && cached) {
          setResult(cached);
        }
      } catch (e) {
        console.warn('Error reading attempt result:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [attemptId]);

  const toggleSolution = (qId: string) => {
    const newSet = new Set(expandedSolutions);
    if (newSet.has(qId)) newSet.delete(qId);
    else newSet.add(qId);
    setExpandedSolutions(newSet);
  };

  if (loading || !result) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
          Loading results & solutions...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Header title="Attempt Analysis" subtitle={result.testTitle} showBack={true} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Scorecard Hero Banner */}
        <View style={[styles.heroCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.xl }]}>
          <View style={styles.scoreTopRow}>
            <View>
              <Text style={[styles.scoreLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                TOTAL MARKS OBTAINED
              </Text>
              <Text style={[styles.scoreValue, { color: theme.primary, fontSize: scaledFontSize('3xl') }]}>
                {result.totalScore.toFixed(2)}{' '}
                <Text style={{ fontSize: scaledFontSize('base'), color: theme.textMuted }}>/ {result.maxMarks.toFixed(2)}</Text>
              </Text>
            </View>

            {/* Rank & Percentile: Strictly Verified Sample-Size Dependent */}
            {result.isSampleSufficientForRank && result.rank !== null ? (
              <View style={[styles.rankBox, { backgroundColor: theme.primaryContainer, borderRadius: radii.md }]}>
                <Text style={[styles.rankNumber, { color: theme.primary, fontSize: scaledFontSize('xl') }]}>
                  Rank #{result.rank}
                </Text>
                <Text style={[styles.rankPercentile, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  {result.percentile?.toFixed(1)}%ile ({result.totalTestTakers} takers)
                </Text>
              </View>
            ) : (
              <View style={[styles.rankBox, { backgroundColor: theme.surfaceVariant, borderRadius: radii.md }]}>
                <Text style={[styles.rankPercentile, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  Rank Pending
                </Text>
                <Text style={[styles.rankPercentile, { color: theme.textSubtle, fontSize: scaledFontSize('xs') }]}>
                  Sample threshold in progress
                </Text>
              </View>
            )}
          </View>

          {/* Quick Metrics Bar */}
          <View style={[styles.statsRow, { borderTopColor: theme.border }]}>
            <View style={styles.statItem}>
              <Target size={16} color={theme.success} />
              <Text style={[styles.statItemVal, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                {result.overallAccuracy}%
              </Text>
              <Text style={[styles.statItemLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Accuracy
              </Text>
            </View>

            <View style={styles.statItem}>
              <CheckCircle2 size={16} color={theme.success} />
              <Text style={[styles.statItemVal, { color: theme.success, fontSize: scaledFontSize('base') }]}>
                {result.correctCount}
              </Text>
              <Text style={[styles.statItemLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Correct
              </Text>
            </View>

            <View style={styles.statItem}>
              <XCircle size={16} color={theme.error} />
              <Text style={[styles.statItemVal, { color: theme.error, fontSize: scaledFontSize('base') }]}>
                {result.incorrectCount}
              </Text>
              <Text style={[styles.statItemLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Incorrect
              </Text>
            </View>

            <View style={styles.statItem}>
              <Clock size={16} color={theme.textSubtle} />
              <Text style={[styles.statItemVal, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                {Math.round(result.totalTimeSpentSeconds / 60)}m
              </Text>
              <Text style={[styles.statItemLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Time Spent
              </Text>
            </View>
          </View>
        </View>

        {/* Weak Topics Recommendation */}
        {result.weakTopics.length > 0 && (
          <View style={[styles.weakTopicsCard, { backgroundColor: theme.warningBg, borderColor: theme.warningBorder, borderRadius: radii.lg }]}>
            <View style={styles.weakTopRow}>
              <AlertTriangle size={18} color={theme.warning} />
              <Text style={[styles.weakHeading, { color: theme.warning, fontSize: scaledFontSize('sm') }]}>
                Target Weak Areas for Revision
              </Text>
            </View>
            {result.weakTopics.map(w => (
              <Text key={w.topicId} style={[styles.weakTopicLine, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                • <Text style={{ fontWeight: '700' }}>{w.topicName}</Text>: {w.incorrectCount} negative marks recorded.
              </Text>
            ))}
          </View>
        )}

        {/* Sectional Performance Breakdown */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeading, { color: theme.text, fontSize: scaledFontSize('lg') }]}>
            Sectional Performance
          </Text>

          {result.sections.map(sec => (
            <View key={sec.sectionId} style={[styles.secCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.md }]}>
              <View style={styles.secHeader}>
                <Text style={[styles.secTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                  {sec.sectionName}
                </Text>
                <Text style={[styles.secScore, { color: theme.primary, fontSize: scaledFontSize('base') }]}>
                  {sec.marksObtained.toFixed(1)} / {sec.maxMarks.toFixed(1)}
                </Text>
              </View>

              <View style={styles.secStatsRow}>
                <Text style={[styles.secStatText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  Attempted: {sec.attemptedQuestions}/{sec.totalQuestions}
                </Text>
                <Text style={[styles.secStatText, { color: theme.success, fontSize: scaledFontSize('xs') }]}>
                  Accuracy: {sec.accuracyPercentage}%
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Question Solutions Review */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeading, { color: theme.text, fontSize: scaledFontSize('lg') }]}>
            Solutions & Answer Keys
          </Text>

          {result.solutions.map((sol, index) => {
            const isExpanded = expandedSolutions.has(sol.questionId);
            return (
              <View
                key={sol.questionId}
                style={[
                  styles.solCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: sol.isCorrect ? theme.successBorder : theme.border,
                    borderRadius: radii.md
                  }
                ]}
              >
                <TouchableOpacity
                  onPress={() => toggleSolution(sol.questionId)}
                  style={[styles.solHeader, { minHeight: touchTarget.minTouchSize }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Question ${index + 1} solution`}
                >
                  <View style={styles.solLeftRow}>
                    {sol.isCorrect ? (
                      <CheckCircle2 size={18} color={theme.success} />
                    ) : sol.userSelectedOptionId ? (
                      <XCircle size={18} color={theme.error} />
                    ) : (
                      <Clock size={18} color={theme.textMuted} />
                    )}
                    <Text style={[styles.solQNum, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                      Question {index + 1}
                    </Text>
                    <Text style={[styles.solMarks, { color: sol.marksAwarded > 0 ? theme.success : theme.error, fontSize: scaledFontSize('xs') }]}>
                      ({sol.marksAwarded > 0 ? `+${sol.marksAwarded}` : sol.marksAwarded} Marks)
                    </Text>
                  </View>

                  {isExpanded ? <ChevronUp size={20} color={theme.textMuted} /> : <ChevronDown size={20} color={theme.textMuted} />}
                </TouchableOpacity>

                {isExpanded && (
                  <View style={[styles.solBody, { borderTopColor: theme.border }]}>
                    <Text style={[styles.solTopic, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                      {sol.subjectName} • {sol.topicName}
                    </Text>

                    <Text style={[styles.solExplanationHeading, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                      Detailed Explanation:
                    </Text>
                    <Text style={[styles.solExplanationText, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                      {sol.explanation}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Back to Home CTA */}
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)')}
          style={[
            styles.homeBtn,
            { minHeight: touchTarget.minTouchSize, backgroundColor: theme.primary, borderRadius: radii.md }
          ]}
          accessibilityRole="button"
        >
          <Text style={[styles.homeBtnText, { color: theme.textInverse, fontSize: scaledFontSize('base') }]}>
            Back to Dashboard
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
    alignItems: 'center',
    gap: 12
  },
  loadingText: {
    fontWeight: '500'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16
  },
  heroCard: {
    padding: 20,
    borderWidth: 1,
    gap: 16
  },
  scoreTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  scoreLabel: {
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4
  },
  scoreValue: {
    fontWeight: '800'
  },
  rankBox: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 2
  },
  rankNumber: {
    fontWeight: '800'
  },
  rankPercentile: {
    fontWeight: '600'
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    borderTopWidth: 1
  },
  statItem: {
    alignItems: 'center',
    gap: 4
  },
  statItemVal: {
    fontWeight: '700'
  },
  statItemLabel: {
    fontWeight: '500'
  },
  weakTopicsCard: {
    padding: 14,
    borderWidth: 1,
    gap: 8
  },
  weakTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  weakHeading: {
    fontWeight: '700'
  },
  weakTopicLine: {
    lineHeight: 18
  },
  section: {
    gap: 12
  },
  sectionHeading: {
    fontWeight: '800'
  },
  secCard: {
    padding: 14,
    borderWidth: 1,
    gap: 6
  },
  secHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  secTitle: {
    fontWeight: '700'
  },
  secScore: {
    fontWeight: '800'
  },
  secStatsRow: {
    flexDirection: 'row',
    gap: 16
  },
  secStatText: {
    fontWeight: '500'
  },
  solCard: {
    borderWidth: 1,
    overflow: 'hidden'
  },
  solHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  solLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  solQNum: {
    fontWeight: '700'
  },
  solMarks: {
    fontWeight: '600'
  },
  solBody: {
    padding: 14,
    borderTopWidth: 1,
    gap: 8
  },
  solTopic: {
    fontWeight: '700',
    letterSpacing: 0.5
  },
  solExplanationHeading: {
    fontWeight: '700',
    marginTop: 4
  },
  solExplanationText: {
    lineHeight: 22
  },
  homeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8
  },
  homeBtnText: {
    fontWeight: '700'
  }
});
