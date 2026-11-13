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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }) {
  return (
    <View style={styles.iconContainer}>
      <Text style={[styles.tabLabel, focused ? styles.tabLabelFocused : null]}>
        {label}
      </Text>
    </View>
  );
}

function MainTabNavigator() {
  const { transfers } = useLocalShare();
  const activeTransfersCount = transfers.filter(
    (t) => t.status === 'in_progress' || t.status === 'queued'
  ).length;

  return (
    <Tab.Navigator
      initialRouteName="Devices"
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0f172a'
        },
        headerTintColor: '#f8fafc',
        headerTitleStyle: {
          fontWeight: '700'
        },
        tabBarStyle: {
          backgroundColor: '#0f172a',
          borderTopColor: 'rgba(255, 255, 255, 0.1)',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8
        },
        tabBarActiveTintColor: '#38bdf8',
        tabBarInactiveTintColor: '#64748b'
      }}
    >
      <Tab.Screen
        name="Devices"
        component={DevicesScreen}
        options={{
          tabBarLabel: 'Devices',
          tabBarIcon: ({ focused }) => <TabIcon label="📱" focused={focused} />
        }}
      />
      <Tab.Screen
        name="Radar"
        component={RadarScreen}
        options={{
          tabBarLabel: 'Radar',
          tabBarIcon: ({ focused }) => <TabIcon label="📡" focused={focused} />
        }}
      />
      <Tab.Screen
        name="ShareHub"
        component={ShareHubScreen}
        options={{
          tabBarLabel: 'Share',
          tabBarIcon: ({ focused }) => <TabIcon label="📤" focused={focused} />
        }}
      />
      <Tab.Screen
        name="Transfers"
        component={TransfersScreen}
        options={{
          tabBarLabel: 'Transfers',
          tabBarBadge: activeTransfersCount > 0 ? activeTransfersCount : undefined,
          tabBarIcon: ({ focused }) => <TabIcon label="🔄" focused={focused} />
        }}
      />
      <Tab.Screen
        name="Received"
        component={ReceivedScreen}
        options={{
          tabBarLabel: 'Received',
          tabBarIcon: ({ focused }) => <TabIcon label="📥" focused={focused} />
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon label="⚙️" focused={focused} />
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Main"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0f172a' }
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
    justifyContent: 'center'
  },
  tabLabel: {
    fontSize: 16,
    opacity: 0.6
  },
  tabLabelFocused: {
    opacity: 1
  }
});
