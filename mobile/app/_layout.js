// mobile/app/_layout.js
import { Stack } from 'expo-router';
// ...

export default function RootLayout() {
  return (
    <>
      <Stack initialRouteName="index">
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="home" options={{ headerShown: false }} />
        <Stack.Screen name="pin-setup" options={{ headerShown: false }} />
        <Stack.Screen name="pin-unlock" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}