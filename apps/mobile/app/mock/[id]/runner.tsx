import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, CheckSquare, AlertTriangle } from 'lucide-react-native';
import { QuestionContent, StartAttemptResponse, AttemptResult } from '@sidprep/contracts';
import { api, ApiError } from '../../../src/api/client';
import { syncEngine } from '../../../src/services/answerSyncEngine';
import { sqliteDb } from '../../../src/services/sqliteDatabase';
import { telemetry } from '../../../src/services/telemetry';
import { useTheme } from '../../../src/context/ThemeContext';
import { useConnectivity } from '../../../src/context/ConnectivityContext';
import { useAppUpdate } from '../../../src/context/UpdateContext';
import { TimerBar } from '../../../src/components/TimerBar';
import { QuestionView } from '../../../src/components/QuestionView';
import { QuestionPaletteModal } from '../../../src/components/QuestionPaletteModal';

export default function MockRunnerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();
  const { isOnline } = useConnectivity();
  const { setTestSessionActive, setTestSubmitting } = useAppUpdate();

  useEffect(() => {
    setTestSessionActive(true);
    return () => {
      setTestSessionActive(false);
    };
  }, [setTestSessionActive]);

  const [attempt, setAttempt] = useState<StartAttemptResponse | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Map<string, string | null>>(new Map());
  const [reviewMarks, setReviewMarks] = useState<Set<string>>(new Set());
  const [remainingSeconds, setRemainingSeconds] = useState(3600);
  const [paletteVisible, setPaletteVisible] = useState(false);
  const [confirmSubmitVisible, setConfirmSubmitVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const timerRef = useRef<any>(null);
  const startTimeRef = useRef<number>(Date.now());

  // Initialize or resume attempt
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!id) return;
        telemetry.track('TEST_STARTED', { testId: id });
        const res = await api.startAttempt(id);
        if (!mounted) return;

        setAttempt(res);
        const expTime = res.expiresAt ? new Date(res.expiresAt).getTime() : Date.now() + (res.durationSeconds || 0) * 1000;
        const serverRemaining = Math.max(0, Math.floor((expTime - Date.now()) / 1000));
        setRemainingSeconds(serverRemaining || res.durationSeconds);

        // Restore previously saved answers
        const ansMap = new Map<string, string | null>();
        const revSet = new Set<string>();
        for (const saved of res.savedAnswers) {
          ansMap.set(saved.questionId, saved.selectedOptionId);
          if (saved.isMarkedForReview) revSet.add(saved.questionId);
        }

        // Also check local SQLite in case device was offline
        const localRecords = await sqliteDb.getAnswersForAttempt(res.attemptId);
        for (const loc of localRecords) {
          ansMap.set(loc.questionId, loc.selectedOptionId);
          if (loc.isMarkedForReview) revSet.add(loc.questionId);
        }

        setUserAnswers(ansMap);
        setReviewMarks(revSet);
      } catch (err: any) {
        Alert.alert('Unable to Start Test', err.message || 'Please check your connection.');
        router.back();
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [id]);

  // Server-authoritative timer countdown loop
  useEffect(() => {
    if (!attempt) return;

    timerRef.current = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleAutoSubmitOnTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [attempt]);

  const handleAutoSubmitOnTimeUp = () => {
    Alert.alert('Time Up!', 'Your exam duration has elapsed. Submitting test attempt now...', [
      { text: 'OK', onPress: () => performSubmission() }
    ]);
  };

  const currentQuestion = attempt?.questions[currentIndex];

  const handleSelectOption = (optionId: string) => {
    if (!attempt || !currentQuestion) return;

    const newMap = new Map(userAnswers);
    newMap.set(currentQuestion.id, optionId);
    setUserAnswers(newMap);

    const isMarked = reviewMarks.has(currentQuestion.id);
    const timeSpent = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000));

    // Save locally immediately to SQLite & sync asynchronously
    syncEngine.recordAnswer({
      attemptId: attempt.attemptId,
      questionId: currentQuestion.id,
      selectedOptionId: optionId,
      isMarkedForReview: isMarked,
      timeSpentSeconds: timeSpent
    });
  };

  const handleClearResponse = () => {
    if (!attempt || !currentQuestion) return;

    const newMap = new Map(userAnswers);
    newMap.set(currentQuestion.id, null);
    setUserAnswers(newMap);

    const isMarked = reviewMarks.has(currentQuestion.id);

    syncEngine.recordAnswer({
      attemptId: attempt.attemptId,
      questionId: currentQuestion.id,
      selectedOptionId: null,
      isMarkedForReview: isMarked,
      timeSpentSeconds: 1
    });
  };

  const handleToggleMarkForReview = () => {
    if (!attempt || !currentQuestion) return;

    const newSet = new Set(reviewMarks);
    const willBeMarked = !newSet.has(currentQuestion.id);
    if (willBeMarked) {
      newSet.add(currentQuestion.id);
    } else {
      newSet.delete(currentQuestion.id);
    }
    setReviewMarks(newSet);

    const currentSelected = userAnswers.get(currentQuestion.id) ?? null;

    syncEngine.recordAnswer({
      attemptId: attempt.attemptId,
      questionId: currentQuestion.id,
      selectedOptionId: currentSelected,
      isMarkedForReview: willBeMarked,
      timeSpentSeconds: 1
    });
  };

  const performSubmission = async () => {
    if (!attempt) return;
    setSubmitting(true);
    setTestSubmitting(true);

    try {
      const totalTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const result: AttemptResult = await syncEngine.submitTest(attempt.attemptId, totalTime);
      setConfirmSubmitVisible(false);

      // Store result in SQLite cache for offline solution review
      await sqliteDb.setCache(`result_${attempt.attemptId}`, result);

      setTestSubmitting(false);
      setTestSessionActive(false);

      router.replace({
        pathname: '/mock/[id]/result',
        params: { id: id as string, attemptId: attempt.attemptId }
      } as any);
    } catch (err: any) {
      setSubmitting(false);
      setTestSubmitting(false);
      if (err instanceof ApiError && err.isOffline) {
        Alert.alert(
          'Offline Submission Guard',
          'You are currently offline. All your answers are safely stored on your device in SQLite. Please connect to the internet to verify your submission and receive authoritative grading.'
        );
      } else {
        Alert.alert('Submission Error', err.message || 'Unable to submit test. Please retry.');
      }
    }
  };

  if (loading || !attempt || !currentQuestion) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
          Loading test environment...
        </Text>
      </View>
    );
  }

  let answeredCount = 0;
  userAnswers.forEach((val) => {
    if (val !== null) answeredCount++;
  });
  const unansweredCount = attempt.questions.length - answeredCount;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Timer Bar with Sync Badge & Question Palette */}
      <TimerBar
        remainingSeconds={remainingSeconds}
        sectionName={currentQuestion.sectionName}
        onPressPalette={() => setPaletteVisible(true)}
        unansweredCount={unansweredCount}
        totalQuestions={attempt.questions.length}
      />

      {/* Main Question View */}
      <QuestionView
        question={currentQuestion}
        selectedOptionId={userAnswers.get(currentQuestion.id) ?? null}
        onSelectOption={handleSelectOption}
        onClearResponse={handleClearResponse}
        isMarkedForReview={reviewMarks.has(currentQuestion.id)}
        onToggleMarkForReview={handleToggleMarkForReview}
      />

      {/* Bottom Navigation Control Bar */}
      <View style={[styles.bottomBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <TouchableOpacity
          disabled={currentIndex === 0}
          onPress={() => setCurrentIndex(currentIndex - 1)}
          style={[
            styles.navBtn,
            {
              minHeight: touchTarget.minTouchSize,
              borderColor: theme.border,
              backgroundColor: currentIndex === 0 ? theme.surfaceVariant : theme.surface,
              borderRadius: radii.base
            }
          ]}
          accessibilityRole="button"
          accessibilityLabel="Previous question"
        >
          <ChevronLeft size={20} color={currentIndex === 0 ? theme.textDisabled : theme.text} />
          <Text style={[styles.navBtnText, { color: currentIndex === 0 ? theme.textDisabled : theme.text, fontSize: scaledFontSize('sm') }]}>
            Previous
          </Text>
        </TouchableOpacity>

        {/* Submit Test Button */}
        <TouchableOpacity
          onPress={() => setConfirmSubmitVisible(true)}
          style={[
            styles.submitBtn,
            {
              minHeight: touchTarget.minTouchSize,
              backgroundColor: theme.success,
              borderRadius: radii.base
            }
          ]}
          accessibilityRole="button"
          accessibilityLabel="Submit exam attempt"
        >
          <CheckSquare size={18} color={theme.textInverse} />
          <Text style={[styles.submitBtnText, { color: theme.textInverse, fontSize: scaledFontSize('sm') }]}>
            Submit Test
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          disabled={currentIndex === attempt.questions.length - 1}
          onPress={() => setCurrentIndex(currentIndex + 1)}
          style={[
            styles.navBtn,
            {
              minHeight: touchTarget.minTouchSize,
              borderColor: theme.border,
              backgroundColor: currentIndex === attempt.questions.length - 1 ? theme.surfaceVariant : theme.surface,
              borderRadius: radii.base
            }
          ]}
          accessibilityRole="button"
          accessibilityLabel="Next question"
        >
          <Text
            style={[
              styles.navBtnText,
              { color: currentIndex === attempt.questions.length - 1 ? theme.textDisabled : theme.text, fontSize: scaledFontSize('sm') }
            ]}
          >
            Next
          </Text>
          <ChevronRight size={20} color={currentIndex === attempt.questions.length - 1 ? theme.textDisabled : theme.text} />
        </TouchableOpacity>
      </View>

      {/* Question Palette Modal */}
      <QuestionPaletteModal
        visible={paletteVisible}
        onClose={() => setPaletteVisible(false)}
        questions={attempt.questions}
        currentIndex={currentIndex}
        userAnswers={userAnswers}
        reviewMarks={reviewMarks}
        onSelectQuestion={(idx) => setCurrentIndex(idx)}
      />

      {/* Submission Confirmation Modal */}
      <Modal visible={confirmSubmitVisible} transparent={true} animationType="fade" onRequestClose={() => setConfirmSubmitVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmCard, { backgroundColor: theme.surface, borderRadius: radii.xl }]}>
            <View style={styles.confirmHeader}>
              <AlertTriangle size={24} color={theme.warning} />
              <Text style={[styles.confirmTitle, { color: theme.text, fontSize: scaledFontSize('lg') }]}>
                Submit Mock Test?
              </Text>
            </View>

            <View style={[styles.statsSummaryBox, { backgroundColor: theme.surfaceVariant }]}>
              <View style={styles.statLine}>
                <Text style={[styles.statLabel, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>Answered:</Text>
                <Text style={[styles.statNum, { color: theme.success, fontSize: scaledFontSize('base') }]}>{answeredCount}</Text>
              </View>
              <View style={styles.statLine}>
                <Text style={[styles.statLabel, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>Unanswered:</Text>
                <Text style={[styles.statNum, { color: theme.error, fontSize: scaledFontSize('base') }]}>{unansweredCount}</Text>
              </View>
              <View style={styles.statLine}>
                <Text style={[styles.statLabel, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>Marked for Review:</Text>
                <Text style={[styles.statNum, { color: theme.warning, fontSize: scaledFontSize('base') }]}>{reviewMarks.size}</Text>
              </View>
            </View>

            <Text style={[styles.confirmNote, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              Once formally submitted, your score will be authoritatively graded on the server and solutions unlocked.
            </Text>

            <View style={styles.confirmBtnRow}>
              <TouchableOpacity
                onPress={() => setConfirmSubmitVisible(false)}
                style={[styles.cancelBtn, { minHeight: touchTarget.minTouchSize, borderColor: theme.border, borderRadius: radii.md }]}
              >
                <Text style={[styles.cancelBtnText, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                  Resume Test
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={performSubmission}
                disabled={submitting}
                style={[styles.confirmBtn, { minHeight: touchTarget.minTouchSize, backgroundColor: theme.primary, borderRadius: radii.md }]}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.textInverse} />
                ) : (
                  <Text style={[styles.confirmBtnText, { color: theme.textInverse, fontSize: scaledFontSize('sm') }]}>
                    Yes, Submit
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 8
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    gap: 4
  },
  navBtnText: {
    fontWeight: '600'
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 6
  },
  submitBtnText: {
    fontWeight: '700'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  confirmCard: {
    width: '100%',
    padding: 20,
    gap: 16
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  confirmTitle: {
    fontWeight: '800'
  },
  statsSummaryBox: {
    padding: 14,
    borderRadius: 8,
    gap: 8
  },
  statLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  statLabel: {
    fontWeight: '500'
  },
  statNum: {
    fontWeight: '800'
  },
  confirmNote: {
    lineHeight: 18
  },
  confirmBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8
  },
  cancelBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1
  },
  cancelBtnText: {
    fontWeight: '600'
  },
  confirmBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  confirmBtnText: {
    fontWeight: '700'
  }
});
