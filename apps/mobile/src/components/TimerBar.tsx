import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Clock, LayoutGrid } from 'lucide-react-native';
import { SyncStatusBadge } from './SyncStatusBadge';
import { useTheme } from '../context/ThemeContext';

interface TimerBarProps {
  remainingSeconds: number;
  sectionName?: string;
  onPressPalette: () => void;
  unansweredCount: number;
  totalQuestions: number;
}

export const TimerBar: React.FC<TimerBarProps> = ({
  remainingSeconds,
  sectionName,
  onPressPalette,
  unansweredCount,
  totalQuestions
}) => {
  const { theme, scaledFontSize, touchTarget } = useTheme();

  const formattedTime = useMemo(() => {
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }, [remainingSeconds]);

  const isWarning = remainingSeconds < 300 && remainingSeconds > 60; // < 5 mins
  const isUrgent = remainingSeconds <= 60; // < 1 min

  const timeColor = isUrgent
    ? theme.error
    : isWarning
    ? theme.warning
    : theme.text;

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <View style={styles.topRow}>
        <View style={styles.timerBlock}>
          <Clock size={18} color={timeColor} />
          <Text
            style={[
              styles.timerText,
              { color: timeColor, fontSize: scaledFontSize('lg') }
            ]}
          >
            {formattedTime}
          </Text>
        </View>

        <SyncStatusBadge />

        <TouchableOpacity
          onPress={onPressPalette}
          style={[
            styles.paletteButton,
            {
              minHeight: touchTarget.minTouchSize,
              backgroundColor: theme.surfaceVariant,
              borderColor: theme.border
            }
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Open question palette. ${totalQuestions - unansweredCount} of ${totalQuestions} answered`}
        >
          <LayoutGrid size={18} color={theme.primary} />
          <Text style={[styles.paletteText, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
            Palette ({totalQuestions - unansweredCount}/{totalQuestions})
          </Text>
        </TouchableOpacity>
      </View>

      {sectionName && (
        <View style={styles.sectionRow}>
          <Text
            style={[styles.sectionNameText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}
            numberOfLines={1}
          >
            Section: {sectionName}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  timerBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  timerText: {
    fontWeight: '800',
    fontVariant: ['tabular-nums']
  },
  paletteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6
  },
  paletteText: {
    fontWeight: '600'
  },
  sectionRow: {
    marginTop: 6
  },
  sectionNameText: {
    fontWeight: '500'
  }
});
