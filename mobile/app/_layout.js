// mobile/app/_layout.js
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        {/* Add the home screen here */}
        <Stack.Screen name="home" options={{ headerTitle: 'My Notes', headerBackVisible: false }} />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}