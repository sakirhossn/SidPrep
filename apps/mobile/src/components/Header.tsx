import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, WifiOff } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useConnectivity } from '../context/ConnectivityContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showBack = false,
  rightAction
}) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, scaledFontSize, touchTarget } = useTheme();
  const { isOnline } = useConnectivity();

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top, 12),
          backgroundColor: theme.surface,
          borderBottomColor: theme.border
        }
      ]}
    >
      <View style={styles.contentRow}>
        <View style={styles.leftContainer}>
          {showBack && (
            <TouchableOpacity
              onPress={() => router.back()}
              style={[
                styles.backButton,
                {
                  minWidth: touchTarget.minTouchSize,
                  minHeight: touchTarget.minTouchSize
                }
              ]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft size={24} color={theme.text} />
            </TouchableOpacity>
          )}
          <View style={styles.titleColumn}>
            <Text
              style={[
                styles.title,
                { color: theme.text, fontSize: scaledFontSize('lg') }
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={[
                  styles.subtitle,
                  { color: theme.textMuted, fontSize: scaledFontSize('xs') }
                ]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.rightContainer}>
          {!isOnline && (
            <View
              style={[
                styles.offlinePill,
                { backgroundColor: theme.surfaceVariant, borderColor: theme.border }
              ]}
            >
              <WifiOff size={14} color={theme.textMuted} />
              <Text
                style={[
                  styles.offlineText,
                  { color: theme.textMuted, fontSize: scaledFontSize('xs') }
                ]}
              >
                Offline
              </Text>
            </View>
          )}
          {rightAction}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44
  },
  leftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  backButton: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginLeft: -8
  },
  titleColumn: {
    flex: 1
  },
  title: {
    fontWeight: '700'
  },
  subtitle: {
    marginTop: 2
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4
  },
  offlineText: {
    fontWeight: '500'
  }
});
