import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { X } from 'lucide-react-native';
import { QuestionContent } from '@sidprep/contracts';
import { useTheme } from '../context/ThemeContext';

interface QuestionPaletteModalProps {
  visible: boolean;
  onClose: () => void;
  questions: QuestionContent[];
  currentIndex: number;
  userAnswers: Map<string, string | null>;
  reviewMarks: Set<string>;
  onSelectQuestion: (index: number) => void;
}

export const QuestionPaletteModal: React.FC<QuestionPaletteModalProps> = ({
  visible,
  onClose,
  questions,
  currentIndex,
  userAnswers,
  reviewMarks,
  onSelectQuestion
}) => {
  const { theme, scaledFontSize, touchTarget, radii } = useTheme();

  let answeredCount = 0;
  let markedCount = 0;
  let notAnsweredCount = 0;

  questions.forEach(q => {
    const isAnswered = userAnswers.has(q.id) && userAnswers.get(q.id) !== null;
    const isMarked = reviewMarks.has(q.id);

    if (isMarked) markedCount++;
    if (isAnswered) answeredCount++;
    else notAnsweredCount++;
  });

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: theme.surface, borderRadius: radii.xl }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Text style={[styles.title, { color: theme.text, fontSize: scaledFontSize('lg') }]}>
              Question Palette
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.closeBtn,
                { minWidth: touchTarget.minTouchSize, minHeight: touchTarget.minTouchSize }
              ]}
              accessibilityRole="button"
              accessibilityLabel="Close question palette"
            >
              <X size={22} color={theme.text} />
            </TouchableOpacity>
          </View>

          {/* Legend Summary */}
          <View style={[styles.legendRow, { backgroundColor: theme.surfaceVariant }]}>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, { backgroundColor: theme.success }]} />
              <Text style={[styles.legendText, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                Answered ({answeredCount})
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, { backgroundColor: theme.warning }]} />
              <Text style={[styles.legendText, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                Marked ({markedCount})
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]} />
              <Text style={[styles.legendText, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                Unanswered ({notAnsweredCount})
              </Text>
            </View>
          </View>

          {/* Grid of Questions */}
          <ScrollView contentContainerStyle={styles.gridContainer}>
            {questions.map((q, idx) => {
              const isAnswered = userAnswers.has(q.id) && userAnswers.get(q.id) !== null;
              const isMarked = reviewMarks.has(q.id);
              const isCurrent = currentIndex === idx;

              let bgColor: string = theme.surface;
              let textColor: string = theme.text;
              let borderColor: string = isCurrent ? theme.primary : theme.border;

              if (isMarked) {
                bgColor = theme.warningBg;
                borderColor = theme.warning;
                textColor = theme.warning;
              } else if (isAnswered) {
                bgColor = theme.success;
                borderColor = theme.success;
                textColor = theme.textInverse;
              }

              return (
                <TouchableOpacity
                  key={q.id}
                  onPress={() => {
                    onSelectQuestion(idx);
                    onClose();
                  }}
                  style={[
                    styles.gridItem,
                    {
                      minWidth: touchTarget.minTouchSize,
                      minHeight: touchTarget.minTouchSize,
                      backgroundColor: bgColor,
                      borderColor: borderColor,
                      borderWidth: isCurrent ? 2.5 : 1
                    }
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Question ${idx + 1}${isAnswered ? ', Answered' : ''}${isMarked ? ', Marked for review' : ''}`}
                >
                  <Text style={[styles.gridText, { color: textColor, fontSize: scaledFontSize('sm') }]}>
                    {idx + 1}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end'
  },
  modalCard: {
    maxHeight: '80%',
    paddingBottom: 24
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1
  },
  title: {
    fontWeight: '700'
  },
  closeBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -8
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 16
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  legendBox: {
    width: 14,
    height: 14,
    borderRadius: 4
  },
  legendText: {
    fontWeight: '600'
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
    justifyContent: 'flex-start'
  },
  gridItem: {
    width: 52,
    height: 52,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center'
  },
  gridText: {
    fontWeight: '700'
  }
});
