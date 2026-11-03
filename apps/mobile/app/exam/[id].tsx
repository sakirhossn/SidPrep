import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ShieldCheck, ExternalLink, ChevronRight, Layers, FileText, CheckCircle2 } from 'lucide-react-native';
import { ExamDetail, SyllabusTopic } from '@sidprep/contracts';
import { api } from '../../src/api/client';
import { useTheme } from '../../src/context/ThemeContext';
import { Header } from '../../src/components/Header';

export default function ExamHubScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();

  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStageIndex, setSelectedStageIndex] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (id) {
          const detail = await api.getExamDetail(id);
          if (mounted) setExam(detail);
        }
      } catch (e) {
        console.warn('Error loading exam detail:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  if (loading || !exam) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const currentStage = exam.stages[selectedStageIndex];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Header title={exam.title} subtitle={`Official ${exam.body} Pattern`} showBack={true} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Verification Status Banner */}
        <View style={[styles.verifiedBanner, { backgroundColor: theme.verifiedBg, borderColor: theme.verified }]}>
          <ShieldCheck size={20} color={theme.verified} />
          <View style={styles.verifiedContent}>
            <Text style={[styles.verifiedTitle, { color: theme.verified, fontSize: scaledFontSize('sm') }]}>
              Official Gazette Verified Pattern
            </Text>
            <Text style={[styles.verifiedSub, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              Last verified: {new Date(exam.lastVerifiedAt ?? Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
          {exam.verificationSourceUrl && (
            <TouchableOpacity
              onPress={() => Linking.openURL(exam.verificationSourceUrl!)}
              style={[styles.sourceLink, { minHeight: touchTarget.minTouchSize, minWidth: touchTarget.minTouchSize }]}
              accessibilityRole="link"
            >
              <ExternalLink size={16} color={theme.verified} />
            </TouchableOpacity>
          )}
        </View>

        {/* Stage Selector Tabs */}
        {exam.stages.length > 1 && (
          <View style={styles.stageTabs}>
            {exam.stages.map((st, idx) => (
              <TouchableOpacity
                key={st.id}
                onPress={() => setSelectedStageIndex(idx)}
                style={[
                  styles.stageTab,
                  {
                    minHeight: touchTarget.minTouchSize,
                    backgroundColor: selectedStageIndex === idx ? theme.primary : theme.surface,
                    borderColor: selectedStageIndex === idx ? theme.primary : theme.border,
                    borderRadius: radii.md
                  }
                ]}
              >
                <Text
                  style={[
                    styles.stageTabText,
                    { color: selectedStageIndex === idx ? theme.textInverse : theme.text, fontSize: scaledFontSize('sm') }
                  ]}
                >
                  {st.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Stage Pattern Specifications */}
        {currentStage && (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.lg }]}>
            <Text style={[styles.cardHeading, { color: theme.text, fontSize: scaledFontSize('base') }]}>
              {currentStage.name} — Exam Structure
            </Text>

            <View style={styles.specsRow}>
              <View style={styles.specBox}>
                <Text style={[styles.specLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  Duration
                </Text>
                <Text style={[styles.specValue, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                  {currentStage.durationMinutes} mins
                </Text>
              </View>

              <View style={styles.specBox}>
                <Text style={[styles.specLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  Questions
                </Text>
                <Text style={[styles.specValue, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                  {currentStage.totalQuestions}
                </Text>
              </View>

              <View style={styles.specBox}>
                <Text style={[styles.specLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  Total Marks
                </Text>
                <Text style={[styles.specValue, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                  {currentStage.totalMarks}
                </Text>
              </View>

              <View style={styles.specBox}>
                <Text style={[styles.specLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  Negative Marking
                </Text>
                <Text style={[styles.specValue, { color: theme.error, fontSize: scaledFontSize('base') }]}>
                  -{currentStage.negativeMarkRate}
                </Text>
              </View>
            </View>

            {/* Sections Breakdown */}
            <View style={styles.sectionsList}>
              <Text style={[styles.subHeading, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                OFFICIAL SECTIONS & MARKING
              </Text>
              {currentStage.sections.map((sec) => (
                <View key={sec.id} style={[styles.sectionItem, { borderColor: theme.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionName, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                      {sec.name}
                    </Text>
                    <Text style={[styles.sectionMarks, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                      {sec.totalQuestions} Questions • {sec.totalMarks} Marks • -{sec.negativeMarking} Neg
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Syllabus Topic Tree */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.lg }]}>
          <Text style={[styles.cardHeading, { color: theme.text, fontSize: scaledFontSize('base') }]}>
            Official Syllabus Hierarchy
          </Text>

          {exam.syllabusTree.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
              Syllabus is being verified with official examination commission bulletin.
            </Text>
          ) : (
            exam.syllabusTree.map((topic: SyllabusTopic) => (
              <View key={topic.id} style={[styles.topicBox, { borderColor: theme.border }]}>
                <View style={styles.topicHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.topicTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                      {topic.title}
                    </Text>
                    {topic.weightagePercentage && (
                      <Text style={[styles.topicWeight, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                        Exam Weightage: ~{topic.weightagePercentage}%
                      </Text>
                    )}
                  </View>
                  <View style={[styles.progressPill, { backgroundColor: theme.surfaceVariant }]}>
                    <Text style={[styles.progressText, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                      {topic.completionPercentage}% Done
                    </Text>
                  </View>
                </View>

                {topic.subtopics && topic.subtopics.map((sub: SyllabusTopic) => (
                  <View key={sub.id} style={styles.subtopicRow}>
                    <CheckCircle2 size={14} color={(sub.completionPercentage ?? 0) >= 100 ? theme.success : theme.textMuted} />
                    <Text style={[styles.subtopicTitle, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
                      {sub.title}
                    </Text>
                  </View>
                ))}
              </View>
            ))
          )}
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16
  },
  verifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12
  },
  verifiedContent: {
    flex: 1
  },
  verifiedTitle: {
    fontWeight: '700'
  },
  verifiedSub: {
    marginTop: 2
  },
  sourceLink: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  stageTabs: {
    flexDirection: 'row',
    gap: 8
  },
  stageTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1
  },
  stageTabText: {
    fontWeight: '700'
  },
  card: {
    padding: 16,
    borderWidth: 1,
    gap: 14
  },
  cardHeading: {
    fontWeight: '800'
  },
  specsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9'
  },
  specBox: {
    alignItems: 'center'
  },
  specLabel: {
    fontWeight: '500',
    marginBottom: 2
  },
  specValue: {
    fontWeight: '700'
  },
  sectionsList: {
    gap: 8
  },
  subHeading: {
    fontWeight: '700',
    letterSpacing: 0.5
  },
  sectionItem: {
    paddingVertical: 8,
    borderBottomWidth: 1
  },
  sectionName: {
    fontWeight: '600'
  },
  sectionMarks: {
    marginTop: 2
  },
  emptyText: {
    lineHeight: 20
  },
  topicBox: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 8
  },
  topicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  topicTitle: {
    fontWeight: '700'
  },
  topicWeight: {
    fontWeight: '600',
    marginTop: 2
  },
  progressPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  progressText: {
    fontWeight: '600'
  },
  subtopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8
  },
  subtopicTitle: {
    fontWeight: '500'
  }
});
