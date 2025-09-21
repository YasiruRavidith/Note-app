// mobile/app/_layout.js
import { Stack } from 'expo-router';
// ...

export default function RootLayout() {
  return (
    <>
      <Stack initialRouteName="home"> {/* <-- TELL IT TO START HERE */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="home" options={{ headerShown: false }} /> {/* We made our own header */}
      </Stack>
      {/* ... */}
    </>
  );
}