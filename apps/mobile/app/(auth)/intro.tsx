import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Target, Clock, BarChart3, ArrowRight, CheckCircle2 } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

interface IntroSlide {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  icon: 'target' | 'clock' | 'progress';
}

const SLIDES: IntroSlide[] = [
  {
    id: 'slide-1',
    badge: 'TARGETED SYLLABUS',
    title: 'Prepare for your target exam.',
    subtitle: 'Master high-yield syllabus topics, previous year question trends, and structured study modules tailored for SSC, RRB, and WBPSC examinations.',
    icon: 'target',
  },
  {
    id: 'slide-2',
    badge: 'REALISTIC SIMULATION',
    title: 'Practise with timed mock tests.',
    subtitle: 'Experience realistic exam environments with timed full-length and sectional mocks, authentic negative marking rules, and instant performance analysis.',
    icon: 'clock',
  },
  {
    id: 'slide-3',
    badge: 'DAILY CONSISTENCY',
    title: 'Organise your preparation and track progress.',
    subtitle: 'Stay on course with daily study goals, streak tracking, question-level accuracy breakdowns, and reliable offline attempt synchronisation.',
    icon: 'progress',
  },
];

export default function IntroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();
  const { markIntroCompleted } = useAuth();

  const [currentIndex, setCurrentIndex] = useState(0);

  const handleFinish = async () => {
    await markIntroCompleted();
    router.replace('/(auth)/account-options');
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleFinish();
    }
  };

  const currentSlide = SLIDES[currentIndex];

  const renderIcon = (type: IntroSlide['icon']) => {
    switch (type) {
      case 'target':
        return <Target size={52} color={theme.primary} strokeWidth={2} />;
      case 'clock':
        return <Clock size={52} color={theme.primary} strokeWidth={2} />;
      case 'progress':
        return <BarChart3 size={52} color={theme.primary} strokeWidth={2} />;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.content, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 24) }]}>
        {/* Brand Banner */}
        <View style={styles.topBrand}>
          <Text style={[styles.brandText, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
            SIDPREP
          </Text>
          <View style={[styles.brandPill, { backgroundColor: theme.primaryContainer }]}>
            <Text style={[styles.brandPillText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
              EXAM PREPARATION
            </Text>
          </View>
        </View>

        {/* Central Illustration / Visual Card */}
        <View style={styles.visualContainer}>
          <View
            style={[
              styles.iconWrapper,
              {
                backgroundColor: theme.primaryContainer,
                borderColor: theme.primary,
                borderRadius: radii.xl || 24,
              },
            ]}
          >
            {renderIcon(currentSlide.icon)}
          </View>

          <View style={[styles.badgeContainer, { backgroundColor: theme.surfaceVariant }]}>
            <Text style={[styles.badgeText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              {currentSlide.badge}
            </Text>
          </View>

          <Text
            style={[
              styles.heading,
              { color: theme.text, fontSize: width < 360 ? 24 : 28 },
            ]}
          >
            {currentSlide.title}
          </Text>

          <Text
            style={[
              styles.subtext,
              { color: theme.textMuted, fontSize: scaledFontSize('base') },
            ]}
          >
            {currentSlide.subtitle}
          </Text>
        </View>

        {/* Progress Indicators & Bottom Action Bar */}
        <View style={styles.bottomBar}>
          {/* Progress Indicators */}
          <View style={styles.indicatorRow} accessibilityLabel={`Step ${currentIndex + 1} of ${SLIDES.length}`}>
            {SLIDES.map((slide, idx) => {
              const isActive = idx === currentIndex;
              return (
                <View
                  key={slide.id}
                  style={[
                    styles.indicatorDot,
                    {
                      backgroundColor: isActive ? theme.primary : theme.borderStrong,
                      width: isActive ? 24 : 8,
                      borderRadius: 4,
                    },
                  ]}
                />
              );
            })}
          </View>

          {/* Action Row */}
          <View style={styles.navigationRow}>
            {/* Bottom-left Skip */}
            <TouchableOpacity
              onPress={handleFinish}
              style={[styles.skipButton, { minHeight: touchTarget.minTouchSize }]}
              accessibilityRole="button"
              accessibilityLabel="Skip introduction and proceed to account options"
            >
              <Text style={[styles.skipText, { color: theme.textMuted, fontSize: scaledFontSize('base') }]}>
                Skip
              </Text>
            </TouchableOpacity>

            {/* Bottom-right Next or Get Started */}
            {currentIndex === SLIDES.length - 1 ? (
              <TouchableOpacity
                onPress={handleFinish}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: theme.primary,
                    borderRadius: radii.md,
                    minHeight: touchTarget.minTouchSize,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Get started and create an account"
              >
                <Text style={[styles.primaryButtonText, { color: theme.textInverse, fontSize: scaledFontSize('base') }]}>
                  Get started
                </Text>
                <CheckCircle2 size={18} color={theme.textInverse} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleNext}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: theme.primary,
                    borderRadius: radii.md,
                    minHeight: touchTarget.minTouchSize,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Next slide"
              >
                <Text style={[styles.primaryButtonText, { color: theme.textInverse, fontSize: scaledFontSize('base') }]}>
                  Next
                </Text>
                <ArrowRight size={18} color={theme.textInverse} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  topBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandText: {
    fontWeight: '900',
    letterSpacing: 2,
  },
  brandPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  brandPillText: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  visualContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  iconWrapper: {
    width: 104,
    height: 104,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  badgeContainer: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 14,
  },
  badgeText: {
    fontWeight: '700',
    letterSpacing: 1,
  },
  heading: {
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 14,
  },
  subtext: {
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 340,
  },
  bottomBar: {
    width: '100%',
    paddingTop: 16,
  },
  indicatorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
  },
  indicatorDot: {
    height: 8,
  },
  navigationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skipButton: {
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  skipText: {
    fontWeight: '600',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  primaryButtonText: {
    fontWeight: '700',
  },
});
