import React from 'react';
import { Tabs } from 'expo-router';
import { Home, BookOpen, Newspaper, User } from 'lucide-react-native';
import { useTheme } from '../../src/context/ThemeContext';

export default function TabLayout() {
  const { theme, scaledFontSize } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8
        },
        tabBarLabelStyle: {
          fontSize: scaledFontSize('xs'),
          fontWeight: '600'
        }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="mocks"
        options={{
          title: 'Mocks',
          tabBarIcon: ({ color, size }) => <BookOpen size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="affairs"
        options={{
          title: 'Affairs',
          tabBarIcon: ({ color, size }) => <Newspaper size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />
        }}
      />
    </Tabs>
  );
}
