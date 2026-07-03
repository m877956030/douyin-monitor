import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PortalHost } from '@rn-primitives/portal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import "../global.css";

const queryClient = new QueryClient();

const RootLayout: React.FC = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" backgroundColor="#FFFFFF" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(app)" />
        </Stack>
        <PortalHost />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
};

export default RootLayout;
