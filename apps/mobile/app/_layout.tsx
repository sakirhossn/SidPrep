import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { ConnectivityProvider } from '../src/context/ConnectivityContext';
import { AuthProvider } from '../src/context/AuthContext';
import { UpdateProvider } from '../src/context/UpdateContext';
import { AutoUpdateChecker } from '../src/components/AutoUpdateChecker';

function RootNavigation() {
  const { isDark, theme } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AutoUpdateChecker />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background }
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/intro" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/account-options" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/register" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="exam/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="mock/[id]/index" options={{ headerShown: false }} />
        <Stack.Screen name="mock/[id]/runner" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="mock/[id]/result" options={{ headerShown: false }} />
        <Stack.Screen name="study-plan" options={{ headerShown: false }} />
        <Stack.Screen name="resources/index" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="update" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ConnectivityProvider>
          <AuthProvider>
            <UpdateProvider>
              <RootNavigation />
            </UpdateProvider>
          </AuthProvider>
        </ConnectivityProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
