import React, { useEffect } from 'react';
import * as Updates from 'expo-updates';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { AdminLoginController } from './src/controlllers/AdminLoginController';

export default function App() {
  useEffect(() => {
    async function fetchAndApplyUpdate() {
      try {
        // 1. Check Expo servers for a new OTA update
        const update = await Updates.checkForUpdateAsync();
        
        if (update.isAvailable) {
          // 2. Download the bundle
          await Updates.fetchUpdateAsync();
          
          // 3. Immediately reload the app with the new code live!
          await Updates.reloadAsync();
        }
      } catch (error) {
        // If offline or request fails, open app normally
        console.log('Error checking for updates:', error);
      }
    }

    if (!__DEV__) {
      fetchAndApplyUpdate();
    }
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AdminLoginController />
    </SafeAreaProvider>
  );
}