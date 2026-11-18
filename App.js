import React, { useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { LocalShareProvider, useLocalShare } from './src/engine/providers';
import { LocalShareNode } from './src/engine/LocalShareNode';
import PinDialog from './src/components/PinDialog';
import { ThemeProvider, useTheme } from './src/theme';
import { defaultLogger } from './src/utils/logger';

const logger = defaultLogger;

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

function MainNavigationShell() {
  const { navTheme, theme } = useTheme();

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={theme.colors.statusBarStyle} />
      <AppNavigator />
      <GlobalPinChallengeModal />
    </NavigationContainer>
  );
}

export default function App() {
  const nodeInstance = useMemo(() => {
    const node = new LocalShareNode();
    node.start().catch((err) => {
      logger.error('Failed to start LocalShareNode:', err);
    });
    return node;
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LocalShareProvider nodeInstance={nodeInstance}>
          <MainNavigationShell />
        </LocalShareProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
