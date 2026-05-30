import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import RootNavigator from './src/navigation/RootNavigator';
import { useAuthListener } from './src/hooks/useAuthListener';

const queryClient = new QueryClient();

function AppInner() {
  useAuthListener();
  return (
    <>
      <StatusBar style="light" />
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer>
        <AppInner />
      </NavigationContainer>
    </QueryClientProvider>
  );
}
