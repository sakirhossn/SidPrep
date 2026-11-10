import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Calendar, ShieldCheck, Flame, Target, ExternalLink } from 'lucide-react-native';
import { ExamSummary } from '@sidprep/contracts';
import { useTheme } from '../context/ThemeContext';

interface ExamCountdownCardProps {
  exam: ExamSummary;
  streakDays: number;
  dailyTargetMinutes: number;
  completedMinutes: number;
  accuracyRate: number;
  onPressExamHub?: () => void;
}

export const ExamCountdownCard: React.FC<ExamCountdownCardProps> = ({
  exam,
  streakDays,
  dailyTargetMinutes,
  completedMinutes,
  accuracyRate,
  onPressExamHub
}) => {
  const { theme, scaledFontSize, radii, elevations } = useTheme();

  // Calculate official countdown days or past completion status
  const countdownState = useMemo<{ type: 'UPCOMING' | 'COMPLETED' | 'UNANNOUNCED'; days?: number }>(() => {
    if (!exam.isDateAnnounced || !exam.officialExamDate) {
      return { type: 'UNANNOUNCED' };
    }
    const target = new Date(exam.officialExamDate).getTime();
    const now = Date.now();
    const diffDays = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return { type: 'COMPLETED' };
    }
    return { type: 'UPCOMING', days: diffDays };
  }, [exam.isDateAnnounced, exam.officialExamDate]);

  const openSource = () => {
    if (exam.verificationSourceUrl) {
      Linking.openURL(exam.verificationSourceUrl);
    }
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderRadius: radii.lg,
          ...elevations.card
        }
      ]}
    >
      {/* Top Header: Exam Title & Verification Badge */}
      <View style={styles.topRow}>
        <View style={styles.badgeContainer}>
          <View style={[styles.bodyBadge, { backgroundColor: theme.primaryContainer }]}>
            <Text style={[styles.bodyBadgeText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
              {exam.body}
            </Text>
          </View>
          {exam.lastVerifiedAt && (
            <View style={[styles.verifiedPill, { backgroundColor: theme.verifiedBg }]}>
              <ShieldCheck size={12} color={theme.verified} />
              <Text style={[styles.verifiedText, { color: theme.verified, fontSize: scaledFontSize('xs') }]}>
                Verified
              </Text>
            </View>
          )}
        </View>

        {exam.verificationSourceUrl && (
          <TouchableOpacity
            onPress={openSource}
            style={styles.sourceBtn}
            accessibilityRole="link"
            accessibilityLabel="Open official verification source"
          >
            <ExternalLink size={14} color={theme.textSubtle} />
          </TouchableOpacity>
        )}
      </View>

      <Text
        style={[
          styles.examTitle,
          { color: theme.text, fontSize: scaledFontSize('xl') }
        ]}
      >
        {exam.title}
      </Text>

      {/* Official Date Notice or Realistic Countdown */}
      <View
        style={[
          styles.countdownBox,
          {
            backgroundColor: exam.isDateAnnounced ? theme.primaryContainer : theme.surfaceVariant,
            borderRadius: radii.md
          }
        ]}
      >
        <Calendar size={18} color={countdownState.type === 'UPCOMING' ? theme.primary : theme.textMuted} />
        {countdownState.type === 'UPCOMING' ? (
          <View style={styles.countdownContent}>
            <Text style={[styles.countdownNumber, { color: theme.primary, fontSize: scaledFontSize('base') }]}>
              {countdownState.days} Days Remaining
            </Text>
            <Text style={[styles.countdownSub, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              Exam: {new Date(exam.officialExamDate!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
        ) : countdownState.type === 'COMPLETED' ? (
          <View style={styles.countdownContent}>
            <Text style={[styles.countdownNumber, { color: theme.textMuted, fontSize: scaledFontSize('base') }]}>
              Exam Completed
            </Text>
            <Text style={[styles.countdownSub, { color: theme.textSubtle, fontSize: scaledFontSize('xs') }]}>
              Conducted: {new Date(exam.officialExamDate!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
        ) : (
          <View style={styles.countdownContent}>
            <Text style={[styles.unannouncedText, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
              Date Not Announced
            </Text>
            <Text style={[styles.unannouncedSub, { color: theme.textSubtle, fontSize: scaledFontSize('xs') }]}>
              Status: {exam.currentStatus.replace(/_/g, ' ')}
            </Text>
          </View>
        )}
      </View>

      {/* Daily Progress & Metrics Row */}
      <View style={[styles.metricsRow, { borderTopColor: theme.border }]}>
        <View style={styles.metricItem}>
          <View style={styles.metricLabelRow}>
            <Flame size={14} color={theme.warning} />
            <Text style={[styles.metricLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              Streak
            </Text>
          </View>
          <Text style={[styles.metricValue, { color: theme.text, fontSize: scaledFontSize('lg') }]}>
            {streakDays} <Text style={{ fontSize: scaledFontSize('xs') }}>days</Text>
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.metricItem}>
          <View style={styles.metricLabelRow}>
            <Target size={14} color={theme.primary} />
            <Text style={[styles.metricLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              Daily Goal
            </Text>
          </View>
          <Text style={[styles.metricValue, { color: theme.text, fontSize: scaledFontSize('lg') }]}>
            {completedMinutes}/{dailyTargetMinutes} <Text style={{ fontSize: scaledFontSize('xs') }}>min</Text>
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
            Accuracy
          </Text>
          <Text style={[styles.metricValue, { color: theme.success, fontSize: scaledFontSize('lg') }]}>
            {accuracyRate}%
          </Text>
        </View>
      </View>

      {/* Button to View Full Syllabus & Exam Hub */}
      {onPressExamHub && (
        <TouchableOpacity
          onPress={onPressExamHub}
          style={[
            styles.hubButton,
            { backgroundColor: theme.surfaceVariant, borderRadius: radii.base }
          ]}
          accessibilityRole="button"
          accessibilityLabel="View full exam pattern and syllabus"
        >
          <Text style={[styles.hubButtonText, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
            View Official Pattern & Syllabus
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderWidth: 1,
    marginHorizontal: 16,
    marginVertical: 8
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  bodyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6
  },
  bodyBadgeText: {
    fontWeight: '700'
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4
  },
  verifiedText: {
    fontWeight: '600'
  },
  sourceBtn: {
    padding: 4
  },
  examTitle: {
    fontWeight: '800',
    lineHeight: 26,
    marginBottom: 12
  },
  countdownBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
    marginBottom: 16
  },
  countdownContent: {
    flex: 1
  },
  countdownNumber: {
    fontWeight: '700'
  },
  countdownSub: {
    marginTop: 2
  },
  unannouncedText: {
    fontWeight: '600'
  },
  unannouncedSub: {
    marginTop: 2
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1
  },
  metricItem: {
    flex: 1,
    alignItems: 'center'
  },
  metricLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4
  },
  metricLabel: {
    fontWeight: '500'
  },
  metricValue: {
    fontWeight: '700'
  },
  divider: {
    width: 1,
    height: 28
  },
  hubButton: {
    marginTop: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  hubButtonText: {
    fontWeight: '600'
  }
});
