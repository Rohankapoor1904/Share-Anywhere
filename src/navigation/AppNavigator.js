import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PermissionsScreen from '../screens/PermissionsScreen';
import DevicesScreen from '../screens/DevicesScreen';
import RadarScreen from '../screens/RadarScreen';
import ShareHubScreen from '../screens/ShareHubScreen';
import TransfersScreen from '../screens/TransfersScreen';
import ReceivedScreen from '../screens/ReceivedScreen';
import RemoteExplorerScreen from '../screens/RemoteExplorerScreen';
import SettingsScreen from '../screens/SettingsScreen';
import Icon from '../components/Icon';
import { useLocalShare } from '../engine/providers';
import { useTheme } from '../theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/**
 * Tab icon: monochrome, slightly heavier stroke when focused.
 * @param {object} props
 * @param {string} props.name - Icon identifier.
 * @param {boolean} props.focused
 */
function TabIcon({ name, focused }) {
  const { theme } = useTheme();

  return (
    <View style={styles.tabIconWrapper}>
      <Icon
        name={name}
        size={21}
        color={focused ? theme.colors.tabBarActive : theme.colors.tabBarInactive}
        strokeWidth={focused ? 2.2 : 1.8}
      />
    </View>
  );
}

function MainTabNavigator() {
  const { transfers } = useLocalShare();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const activeTransfersCount = transfers.filter(
    (t) => t.status === 'in_progress' || t.status === 'queued'
  ).length;

  const tabBarIcon = (name) => ({ focused }) => <TabIcon name={name} focused={focused} />;
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tab.Navigator
      initialRouteName="Devices"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.tabBar,
          borderTopColor: theme.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 52 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
          elevation: 0,
          shadowOpacity: 0
        },
        tabBarShowLabel: true,
        tabBarActiveTintColor: theme.colors.tabBarActive,
        tabBarInactiveTintColor: theme.colors.tabBarInactive,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginTop: 1
        },
        tabBarBadgeStyle: {
          backgroundColor: theme.colors.primary,
          color: theme.colors.onPrimary,
          fontSize: 10,
          fontWeight: '600',
          minWidth: 16,
          height: 16,
          lineHeight: 16
        }
      }}
    >
      <Tab.Screen
        name="Devices"
        component={DevicesScreen}
        options={{ tabBarLabel: 'Home', tabBarIcon: tabBarIcon('devices') }}
      />
      <Tab.Screen
        name="Files"
        component={RemoteExplorerScreen}
        options={{ tabBarLabel: 'Files', tabBarIcon: tabBarIcon('files') }}
      />
      <Tab.Screen
        name="Transfers"
        component={TransfersScreen}
        options={{
          tabBarLabel: 'Activity',
          tabBarBadge: activeTransfersCount > 0 ? activeTransfersCount : undefined,
          tabBarIcon: tabBarIcon('transfers')
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings', tabBarIcon: tabBarIcon('settings') }}
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
      <Stack.Screen name="ShareHub" component={ShareHubScreen} />
      <Stack.Screen name="Radar" component={RadarScreen} />
      <Stack.Screen name="Received" component={ReceivedScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabIconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 24
  }
});
