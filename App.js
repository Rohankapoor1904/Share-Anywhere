import React, { useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { LocalShareProvider, useLocalShare } from './src/engine/providers';
import { LocalShareNode } from './src/engine/LocalShareNode';
import PinDialog from './src/components/PinDialog';

function GlobalPinChallengeModal() {
  const { activeChallenge, respondPinChallenge, dismissPinChallenge } = useLocalShare();

  return (
    <PinDialog
      visible={!!activeChallenge}
      challenge={activeChallenge}
      onConfirm={respondPinChallenge}
      onReject={dismissPinChallenge}
    />
  );
}

export default function App() {
  const nodeInstance = useMemo(() => {
    const node = new LocalShareNode();
    node.start().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to start LocalShareNode:', err);
    });
    return node;
  }, []);

  const navTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: '#0f172a',
      card: '#0f172a',
      text: '#f8fafc',
      border: 'rgba(255, 255, 255, 0.1)'
    }
  };

  return (
    <SafeAreaProvider>
      <LocalShareProvider nodeInstance={nodeInstance}>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="light" />
          <AppNavigator />
          <GlobalPinChallengeModal />
        </NavigationContainer>
      </LocalShareProvider>
    </SafeAreaProvider>
  );
}
