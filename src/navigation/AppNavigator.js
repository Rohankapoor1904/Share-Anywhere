import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import PermissionsScreen from '../screens/PermissionsScreen';
import DevicesScreen from '../screens/DevicesScreen';
import RadarScreen from '../screens/RadarScreen';
import ShareHubScreen from '../screens/ShareHubScreen';
import TransfersScreen from '../screens/TransfersScreen';
import ReceivedScreen from '../screens/ReceivedScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useLocalShare } from '../engine/providers';
import { useTheme } from '../theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ glyph, focused, activeColor, inactiveColor }) {
  return (
    <View style={[styles.iconContainer, focused ? styles.iconContainerFocused : null]}>
      <Text style={[styles.tabGlyph, { color: focused ? activeColor : inactiveColor }]}>
        {glyph}
      </Text>
    </View>
  );
}

function MainTabNavigator() {
  const { transfers } = useLocalShare();
  const { theme } = useTheme();

  const activeTransfersCount = transfers.filter(
    (t) => t.status === 'in_progress' || t.status === 'queued'
  ).length;

  return (
    <Tab.Navigator
      initialRouteName="Devices"
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.background,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          shadowOpacity: 0,
          elevation: 0
        },
        headerTintColor: theme.colors.text,
        headerTitleStyle: {
          fontWeight: '800',
          fontSize: 19,
          letterSpacing: 0.3
        },
        tabBarStyle: {
          backgroundColor: theme.colors.tabBar,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
          elevation: 8,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.15,
          shadowRadius: 6
        },
        tabBarActiveTintColor: theme.colors.tabBarActive,
        tabBarInactiveTintColor: theme.colors.tabBarInactive,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2
        },
        tabBarBadgeStyle: {
          backgroundColor: theme.colors.primary,
          color: theme.mode === 'light' ? '#ffffff' : '#000000',
          fontSize: 10,
          fontWeight: '800'
        }
      }}
    >
      <Tab.Screen
        name="Devices"
        component={DevicesScreen}
        options={{
          tabBarLabel: 'Devices',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              glyph="📱"
              focused={focused}
              activeColor={theme.colors.tabBarActive}
              inactiveColor={theme.colors.tabBarInactive}
            />
          )
        }}
      />
      <Tab.Screen
        name="Radar"
        component={RadarScreen}
        options={{
          tabBarLabel: 'Radar',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              glyph="📡"
              focused={focused}
              activeColor={theme.colors.tabBarActive}
              inactiveColor={theme.colors.tabBarInactive}
            />
          )
        }}
      />
      <Tab.Screen
        name="ShareHub"
        component={ShareHubScreen}
        options={{
          tabBarLabel: 'Share',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              glyph="📤"
              focused={focused}
              activeColor={theme.colors.tabBarActive}
              inactiveColor={theme.colors.tabBarInactive}
            />
          )
        }}
      />
      <Tab.Screen
        name="Transfers"
        component={TransfersScreen}
        options={{
          tabBarLabel: 'Transfers',
          tabBarBadge: activeTransfersCount > 0 ? activeTransfersCount : undefined,
          tabBarIcon: ({ focused }) => (
            <TabIcon
              glyph="🔄"
              focused={focused}
              activeColor={theme.colors.tabBarActive}
              inactiveColor={theme.colors.tabBarInactive}
            />
          )
        }}
      />
      <Tab.Screen
        name="Received"
        component={ReceivedScreen}
        options={{
          tabBarLabel: 'Received',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              glyph="📥"
              focused={focused}
              activeColor={theme.colors.tabBarActive}
              inactiveColor={theme.colors.tabBarInactive}
            />
          )
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              glyph="⚙️"
              focused={focused}
              activeColor={theme.colors.tabBarActive}
              inactiveColor={theme.colors.tabBarInactive}
            />
          )
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { theme } = useTheme();

  return (
    <Stack.Navigator
      initialRouteName="Main"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background }
      }}
    >
      <Stack.Screen name="Permissions" component={PermissionsScreen} />
      <Stack.Screen name="Main" component={MainTabNavigator} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 16
  },
  iconContainerFocused: {
    transform: [{ scale: 1.1 }]
  },
  tabGlyph: {
    fontSize: 18
  }
});
