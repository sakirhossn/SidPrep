import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { QuestionContent, QuestionOption } from '@sidprep/contracts';
import { useTheme } from '../context/ThemeContext';

interface QuestionViewProps {
  question: QuestionContent;
  selectedOptionId: string | null;
  onSelectOption: (optionId: string) => void;
  onClearResponse: () => void;
  isMarkedForReview: boolean;
  onToggleMarkForReview: () => void;
}

export const QuestionView: React.FC<QuestionViewProps> = ({
  question,
  selectedOptionId,
  onSelectOption,
  onClearResponse,
  isMarkedForReview,
  onToggleMarkForReview
}) => {
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Top Question Header: Number, Marks, Negative */}
      <View style={styles.headerRow}>
        <View style={styles.qNumBadge}>
          <Text style={[styles.qNumText, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
            Question {question.questionNumber}
          </Text>
        </View>

        <View style={styles.marksBadgeRow}>
          <View style={[styles.marksBadge, { backgroundColor: theme.successBg }]}>
            <Text style={[styles.marksText, { color: theme.success, fontSize: scaledFontSize('xs') }]}>
              +{question.marks}
            </Text>
          </View>
          <View style={[styles.marksBadge, { backgroundColor: theme.errorBg }]}>
            <Text style={[styles.marksText, { color: theme.error, fontSize: scaledFontSize('xs') }]}>
              -{question.negativeMarks}
            </Text>
          </View>
        </View>
      </View>

      {/* Question Text */}
      <View style={[styles.questionBox, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.md }]}>
        <Text style={[styles.questionText, { color: theme.text, fontSize: scaledFontSize('base') }]}>
          {question.text}
        </Text>

        {question.imageUrl && (
          <Image
            source={{ uri: question.imageUrl }}
            style={styles.questionImage}
            resizeMode="contain"
            accessibilityLabel={`Illustration for question ${question.questionNumber}`}
          />
        )}
      </View>

      {/* Options List */}
      <View style={styles.optionsList}>
        {question.options.map((opt: QuestionOption, index: number) => {
          const isSelected = selectedOptionId === opt.id;
          const label = String.fromCharCode(65 + index); // A, B, C, D

          return (
            <TouchableOpacity
              key={opt.id}
              onPress={() => onSelectOption(opt.id)}
              style={[
                styles.optionButton,
                {
                  minHeight: touchTarget.minTouchSize,
                  borderRadius: radii.md,
                  borderColor: isSelected ? theme.primary : theme.border,
                  backgroundColor: isSelected ? theme.primaryContainer : theme.surface
                }
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`Option ${label}: ${opt.text}`}
            >
              <View
                style={[
                  styles.optionLabelCircle,
                  {
                    backgroundColor: isSelected ? theme.primary : theme.surfaceVariant,
                    borderColor: isSelected ? theme.primary : theme.borderStrong
                  }
                ]}
              >
                <Text
                  style={[
                    styles.optionLabelText,
                    {
                      color: isSelected ? theme.textInverse : theme.text,
                      fontSize: scaledFontSize('sm')
                    }
                  ]}
                >
                  {label}
                </Text>
              </View>

              <Text
                style={[
                  styles.optionText,
                  {
                    color: isSelected ? theme.primary : theme.text,
                    fontSize: scaledFontSize('base'),
                    fontWeight: isSelected ? '600' : '400'
                  }
                ]}
              >
                {opt.text}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Actions Row: Clear Response & Mark for Review */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={onToggleMarkForReview}
          style={[
            styles.secondaryActionBtn,
            {
              minHeight: touchTarget.minTouchSize,
              borderColor: isMarkedForReview ? theme.warning : theme.border,
              backgroundColor: isMarkedForReview ? theme.warningBg : theme.surface,
              borderRadius: radii.base
            }
          ]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isMarkedForReview }}
          accessibilityLabel="Mark question for review"
        >
          <Text
            style={[
              styles.actionBtnText,
              {
                color: isMarkedForReview ? theme.warning : theme.textMuted,
                fontSize: scaledFontSize('sm')
              }
            ]}
          >
            {isMarkedForReview ? '★ Marked for Review' : '☆ Mark for Review'}
          </Text>
        </TouchableOpacity>

        {selectedOptionId && (
          <TouchableOpacity
            onPress={onClearResponse}
            style={[
              styles.secondaryActionBtn,
              {
                minHeight: touchTarget.minTouchSize,
                borderColor: theme.border,
                backgroundColor: theme.surface,
                borderRadius: radii.base
              }
            ]}
            accessibilityRole="button"
            accessibilityLabel="Clear response"
          >
            <Text style={[styles.actionBtnText, { color: theme.error, fontSize: scaledFontSize('sm') }]}>
              Clear Response
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  qNumBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6
  },
  qNumText: {
    fontWeight: '700'
  },
  marksBadgeRow: {
    flexDirection: 'row',
    gap: 8
  },
  marksBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6
  },
  marksText: {
    fontWeight: '700'
  },
  questionBox: {
    padding: 16,
    borderWidth: 1,
    marginBottom: 16
  },
  questionText: {
    lineHeight: 24,
    fontWeight: '500'
  },
  questionImage: {
    width: '100%',
    height: 180,
    marginTop: 12
  },
  optionsList: {
    gap: 12,
    marginBottom: 20
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1.5,
    gap: 12
  },
  optionLabelCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  optionLabelText: {
    fontWeight: '700'
  },
  optionText: {
    flex: 1,
    lineHeight: 22
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 8
  },
  secondaryActionBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderWidth: 1
  },
  actionBtnText: {
    fontWeight: '600'
  }
});
