import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

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

const AnimatedView = /** @type {any} */ (Animated.View);

/**
 * Tab icon inside a glowing pill that springs in when its tab becomes focused.
 * @param {object} props
 * @param {string} props.name - Icon identifier.
 * @param {boolean} props.focused
 */
function TabIcon({ name, focused }) {
  const { theme } = useTheme();
  const focusAnim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(focusAnim, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 120
    }).start();
  }, [focused, focusAnim]);

  const pillOpacity = focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const dotScale = focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const iconScale = focusAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  return (
    <View style={styles.tabIconWrapper}>
      <AnimatedView
        pointerEvents="none"
        style={[
          styles.iconPill,
          {
            backgroundColor: theme.colors.primaryGlow,
            borderColor: theme.colors.borderHighlight,
            opacity: pillOpacity
          }
        ]}
      />
      <AnimatedView style={{ transform: [{ scale: iconScale }] }}>
        <Icon
          name={name}
          size={21}
          color={focused ? theme.colors.tabBarActive : theme.colors.tabBarInactive}
        />
      </AnimatedView>
      <AnimatedView
        style={[
          styles.activeDot,
          {
            backgroundColor: theme.colors.tabBarActive,
            opacity: pillOpacity,
            transform: [{ scale: dotScale }]
          }
        ]}
      />
    </View>
  );
}

function MainTabNavigator() {
  const { transfers } = useLocalShare();
  const { theme } = useTheme();

  const activeTransfersCount = transfers.filter(
    (t) => t.status === 'in_progress' || t.status === 'queued'
  ).length;

  const tabBarIcon = (name) => ({ focused }) => <TabIcon name={name} focused={focused} />;

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
          position: 'absolute',
          backgroundColor: theme.colors.tabBar,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          borderTopLeftRadius: theme.radii.xl,
          borderTopRightRadius: theme.radii.xl,
          height: 68,
          paddingTop: 8,
          paddingBottom: 10,
          elevation: 18,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.28,
          shadowRadius: 18
        },
        tabBarShowLabel: false,
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
        options={{ tabBarLabel: 'Devices', tabBarIcon: tabBarIcon('devices') }}
      />
      <Tab.Screen
        name="ShareHub"
        component={ShareHubScreen}
        options={{ tabBarLabel: 'Share', tabBarIcon: tabBarIcon('share') }}
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
          tabBarLabel: 'Transfers',
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
      <Stack.Screen name="Radar" component={RadarScreen} />
      <Stack.Screen name="Received" component={ReceivedScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabIconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 46,
    height: 34
  },
  iconPill: {
    position: 'absolute',
    width: 46,
    height: 32,
    borderRadius: 16,
    borderWidth: 1
  },
  activeDot: {
    position: 'absolute',
    bottom: -5,
    width: 4,
    height: 4,
    borderRadius: 2
  }
});
