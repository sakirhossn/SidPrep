import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { syncEngine, SyncState } from '../services/answerSyncEngine';
import { useTheme } from '../context/ThemeContext';
import { useConnectivity } from '../context/ConnectivityContext';

export const SyncStatusBadge: React.FC = () => {
  const { theme, scaledFontSize } = useTheme();
  const { isOnline } = useConnectivity();
  const [syncState, setSyncState] = useState<SyncState>(syncEngine.getCurrentSyncState());

  useEffect(() => {
    const unsub = syncEngine.subscribeSyncState((state) => {
      setSyncState(state);
    });
    return unsub;
  }, []);

  const effectiveState = !isOnline ? 'OFFLINE' : syncState;

  const getBadgeConfig = () => {
    switch (effectiveState) {
      case 'SYNCED':
        return { label: 'Synced', color: theme.success, bg: theme.successBg };
      case 'SAVED_LOCALLY':
        return { label: 'Saved Locally', color: theme.warning, bg: theme.warningBg };
      case 'SYNCING':
        return { label: 'Syncing...', color: theme.primary, bg: theme.primaryContainer };
      case 'OFFLINE':
      default:
        return { label: 'Offline (Queueing)', color: theme.textMuted, bg: theme.surfaceVariant };
    }
  };

  const config = getBadgeConfig();

  return (
    <View style={[styles.badge, { backgroundColor: config.bg, borderColor: config.color }]}>
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <Text style={[styles.text, { color: config.color, fontSize: scaledFontSize('xs') }]}>
        {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6
  },
  text: {
    fontWeight: '600'
  }
});
