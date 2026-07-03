import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F5F7FA' } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="works" />
    </Stack>
  );
}
